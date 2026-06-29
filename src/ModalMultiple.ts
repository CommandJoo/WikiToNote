import { App, Modal } from "obsidian";
import { WikiPluginSettings } from "./PluginSettings";
import WikipediaNote from "./WikipediaNote";
import { debouncedFetchSuggestions } from "./SearchResults";

class WikiMultiModal extends Modal {
	private settings: WikiPluginSettings;
	private inputs: HTMLInputElement[] = [];
	private searchWrapper: HTMLElement;

	constructor(app: App, settings: WikiPluginSettings) {
		super(app);
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.classList.add("wiki-modal");

		contentEl.createEl("label", {
			text: "Name of the wikipedia entries:"
		});

		contentEl.createEl("label", {
			text: "Press Enter to add another entry."
		});

		this.searchWrapper = contentEl.createDiv({
			cls: "wiki-search-wrapper"
		});

		this.createInput();

		const submitButton = contentEl.createEl("button", {
			text: "Generate",
			cls: "wiki-button-generate"
		});

		submitButton.onclick = async () => {
			await this.handleSubmit();
			this.close();
		};
	}

	private createInput() {
		const row = this.searchWrapper.createDiv({
			cls: "wiki-input-row"
		});

		const input = row.createEl("input", {
			type: "text"
		});

		const suggestionsEl = row.createDiv({
			cls: "wiki-suggestions"
		});

		suggestionsEl.style.display = "none";

		this.inputs.push(input);

		input.addEventListener("input", async () => {
			await this.onInputChange(input, suggestionsEl);
		});

		input.addEventListener("blur", () => {
			setTimeout(() => {
				this.hideSuggestions(suggestionsEl);
			}, 100);
		});

		input.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;

			e.preventDefault();

			if (input.value.trim() === "") return;

			const isLastInput = this.inputs[this.inputs.length - 1] === input;

			if (isLastInput) {
				this.hideSuggestions(suggestionsEl);
				this.createInput();
			}
		});

		input.focus();
	}

	private async onInputChange(
		input: HTMLInputElement,
		suggestionsEl: HTMLElement
	) {
		const query = input.value.trim();

		if (!query) {
			this.hideSuggestions(suggestionsEl);
			return;
		}

		const results = await debouncedFetchSuggestions(
			query,
			10,
			this.settings
		);

		this.renderSuggestions(results, input, suggestionsEl);
	}

	private renderSuggestions(
		results: { title: string; description: string }[],
		input: HTMLInputElement,
		suggestionsEl: HTMLElement
	) {
		suggestionsEl.empty();

		if (results.length === 0) {
			this.hideSuggestions(suggestionsEl);
			return;
		}

		for (const suggestion of results) {
			const item = suggestionsEl.createDiv({
				cls: "wiki-suggestion-item"
			});

			item.createEl("div", {
				text: suggestion.title,
				cls: "wiki-suggestion-title"
			});

			if (suggestion.description) {
				item.createEl("small", {
					text: suggestion.description,
					cls: "wiki-suggestion-desc"
				});
			}

			item.addEventListener("mousedown", (e) => {
				e.preventDefault();

				input.value = suggestion.title;
				this.hideSuggestions(suggestionsEl);
				input.focus();
			});
		}

		suggestionsEl.style.display = "block";
	}

	private hideSuggestions(suggestionsEl: HTMLElement) {
		suggestionsEl.style.display = "none";
		suggestionsEl.empty();
	}

	onClose() {
		this.contentEl.empty();
		this.inputs = [];
	}

	async handleSubmit() {
		for (const input of this.inputs) {
			const value = input.value.trim();

			if (value !== "") {
				await new WikipediaNote(this.settings).create(value);
			}
		}
	}
}

export default WikiMultiModal;
