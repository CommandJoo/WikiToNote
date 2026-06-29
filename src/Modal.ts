import {App, Modal} from "obsidian";
import {WikiPluginSettings} from "./PluginSettings";
import WikipediaNote from "./WikipediaNote";
import {debouncedFetchSuggestions} from "./SearchResults";

class WikiModal extends Modal {
	private settings: WikiPluginSettings;
	constructor(app: App, settings: WikiPluginSettings) {
		super(app);
		this.settings = settings;
	}

	private input: HTMLInputElement;
	private suggestionsEl: HTMLElement;
	onOpen() {
		const {contentEl} = this;
		contentEl.classList.add("wiki-modal");

		const label = contentEl.createEl('label', { text: 'Name of the wikipedia entry:' });
		label.setAttr('for', 'text-input');

		const searchWrapper = contentEl.createDiv({cls: "wiki-search-wrapper"});

		this.input = searchWrapper.createEl("input", {type: "text"});
		this.input.id = 'text-input';

		this.suggestionsEl = searchWrapper.createDiv({cls: "wiki-suggestions"});
		this.suggestionsEl.addClass("wiki-suggestions-hidden");

		this.input.addEventListener("input", () => {void this.onInputChange()});

		this.input.addEventListener("blur", () => {
			window.setTimeout(() => this.hideSuggestions(), 100);
		});

		const submitButton = contentEl.createEl('button', { text: 'Generate', cls: "wiki-button-generate" });
		submitButton.onclick = async () => {
			await this.handleSubmit();
			this.close();
		};
	}

	private async onInputChange() {
		const query = this.input.value;
		if (!query.trim()) {
			this.hideSuggestions();
			return;
		}

		const results = await debouncedFetchSuggestions(query, 10, this.settings);
		this.renderSuggestions(results);
	}

	private renderSuggestions(results: {title: string, description: string}[]) {
		this.suggestionsEl.empty();

		if (results.length === 0) {
			this.hideSuggestions();
			return;
		}

		results.forEach((suggestion) => {
			const item = this.suggestionsEl.createDiv({cls: "wiki-suggestion-item"});
			item.createEl("div", {text: suggestion.title, cls: "wiki-suggestion-title"});
			if (suggestion.description) {
				item.createEl("small", {text: suggestion.description, cls: "wiki-suggestion-desc"});
			}

			item.addEventListener("mousedown", (e) => {
				e.preventDefault();
				this.input.value = suggestion.title;
				this.hideSuggestions();
				this.input.focus();
			});
		});

		this.suggestionsEl.removeClass("wiki-suggestions-hidden");
	}

	private hideSuggestions() {
		this.suggestionsEl.addClass("wiki-suggestions-hidden");
		this.suggestionsEl.empty();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}

	async handleSubmit() {
		if(this.input.value != "") await new WikipediaNote(this.settings, this.app).create(this.input.value);
	}
}

export default WikiModal;
