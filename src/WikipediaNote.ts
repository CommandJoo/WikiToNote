import {WikiPluginSettings} from "./PluginSettings";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import {App, Notice, requestUrl} from "obsidian";



class WikipediaNote {
	private settings: WikiPluginSettings;
	private app: App;

	constructor(settings: WikiPluginSettings, app: App) {
		this.settings = settings;
		this.app = app;
	}

	async create(article: string) {
		const title = article.replace(/[^\p{L}\p{N}]/gu, "_");

		const content = `---
tags:
- wikipedia-note
---

# ${article}

___

${await fetchWikipediaMarkdown(article, this.settings)}
`;

		await createAndOpenNote(title, content);
	}
}

async function createAndOpenNote(fileName: string, content: string) {
	const filePath = `${fileName}.md`;
	const file = await this.app.vault.create(filePath, content);
	const leaf = this.app.workspace.getLeaf();
	await leaf.openFile(file);
}

async function cleanWikiHtml(title: string, countryPrefix: string) {
	const url = `https://${countryPrefix}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}`;
	try {
		const response = await requestUrl({
			url,
			method: "GET",
			headers: {"User-Agent": "WikiToMarkdown/1.1"}
		});
		const $ = cheerio.load(response.text);
		$("style").remove();
		const $e = $("*");
		$e.removeAttr("rel");
		$e.removeAttr("class");
		$e.removeAttr("about");
		return $;
	} catch (error) {
		new Notice("Unable to fetch data from wikipedia.");
		console.error(error);
		return null;
	}
}

async function fetchWikipediaMarkdown(title: string, settings: WikiPluginSettings): Promise<string> {
	const $ = await cleanWikiHtml(title, settings.countryPrefix);
	if (!$) return "";

	$(".hatnote").each((_, hatnote) => {
		const $hatnote = $(hatnote);
		$hatnote.find("a").each((_, link) => {
			const $link = $(link);
			const href = $link.attr("href");
			if (href && href.startsWith("/wiki/")) {
				$link.attr("href", `https://en.wikipedia.org${href}`);
			}
		});
		$hatnote.replaceWith(`> **${$hatnote.text().trim()}**`);
	});

	$("figure").each((_, figure) => {
		const $figure = $(figure);
		let imgLink = $figure.find("a").find("img").attr("src");
		if (imgLink && imgLink.startsWith("//")) {
			imgLink = `https:${imgLink}`;
		}
		const caption = $figure.find("figcaption").text();

		const html = `
<span class="figure" style="display: inline-block; float: right; max-width: 200px; border: 2px solid ${settings.tableBorder}; background-color: ${settings.tableBackground}; padding: 5px; margin: 10px; clear: both">
	<img alt="image" class="figureimg" src="${imgLink}">
	<p>${caption}</p>
</span>
			`
		$figure.replaceWith(`${html}`);
	});
	$("sup").each((_, sup) => {
		const $sup = $(sup);
		const $a = $sup.find("a");

		const href = $a.attr("href");
		const text = $a.text().replace(/[[\]]/g, "");

		if (href?.includes("#cite_note")) {
			$sup.replaceWith(`[^${text}]`);
		}
	});
	$("table").each((_, table) => {
		const $table = $(table);

		$table.removeAttr("id");
		$table.removeAttr("class");
		$table.removeAttr("typeof");
		$table.removeAttr("data-mw");
		$table.removeAttr("summary");
		$table.removeAttr("cellpadding");

		$table.find("*").each((_, child) => {
			const $child = $(child);

			$child.removeAttr("id");
			$child.removeAttr("class");
			$child.removeAttr("typeof");
			$child.removeAttr("data-mw");
			$child.removeAttr("about");
			$child.removeAttr("resource");
			$child.removeAttr("rel");
			$child.removeAttr("xmlns");

			// $child.removeAttr("style");
		});

		$table.find("img").each((_, img) => {
			const $img = $(img);

			let src = $img.attr("src");
			if (src?.startsWith("//")) {
				src = `https:${src}`;
				$img.attr("src", src);
			}

			let srcset = $img.attr("srcset");
			if (srcset?.startsWith("//")) {
				srcset = `https:${srcset}`;
				$img.attr("srcset", srcset);
			}

			$img.removeAttr("resource");
		});

		$table.attr(
			"style",
			`background-color: ${settings.tableBackground}; border: 1px solid ${settings.tableBackground}; overflow: auto;`
		);
	});

	$("img").each((_, img) => {
		const $img = $(img);
		$img.removeAttr("resource");
		if ($img.hasClass("figureimg")) return;
		let src = $img.attr("src");
		if (src && src.startsWith("//")) {
			src = `https:${src}`;
		}
		if (src) {
			$img.attr("src", src);
		}
	});

	$("a").each((_, link) => {
		const href = $(link).attr("href");
		if (href && href.startsWith("/wiki/")) {
			$(link).attr("href", `https://en.wikipedia.org${href}`);
		}
	});

	$("script, style, noscript, iframe, meta, link").remove();
	$("sup.reference, .mw-editsection, .noprint, .metadata, .navbox, .reflist, .references").remove();
	$("*").each((_, el) => {
		const $el = $(el);

		$el.removeAttr("id");
		$el.removeAttr("typeof");
		$el.removeAttr("data-mw");
		$el.removeAttr("about");
		$el.removeAttr("rel");
		$el.removeAttr("resource");
		$el.removeAttr("xmlns");
	});

	const cleanedHTML = $.html();
	const turndownService = new TurndownService();

	turndownService.keep(["table", "thead", "tbody", "tr", "th", "td", "caption"]);
	turndownService.addRule("figures", {
		filter: "span",
		replacement: (_content: string, node: Node) => {
			if (node.instanceOf(Element) && node.classList.contains("figure")) {
				const serializer = new XMLSerializer();
				return serializer.serializeToString(node);
			}

			return "";
		}
	});
	turndownService.addRule("codeBlock", {
		filter: "pre",
		replacement: (_content: string, node: Node) => {
			const text = node.textContent ?? "";
			return `\n\`\`\`\n${text.trim()}\n\`\`\`\n`;
		}
	});
	turndownService.addRule("inlineCode", {
		filter: (node: Node) => {
			return node.nodeName.toLowerCase() === "code"
				&& node.parentNode?.nodeName.toLowerCase() !== "pre";
		},
		replacement: (content: string) => {
			return `\`${content}\``;
		}
	});
	turndownService.addRule('underscoreHeaders', {
		filter: ['h1', 'h2'],
		replacement: (content: string, node: Node) => {
			const level = node.nodeName.toLowerCase() === "h1" ? 1 : 2;
			const underlineChar = "_";

			return `${"#".repeat(level)} ${content}\n${underlineChar.repeat(content.length)}\n`;
		}
	});
	turndownService.addRule("unwrapGenericHtml", {
		filter: ["div", "span", "section", "article"],
		replacement: (content: string) => content
	});

	return turndownService.turndown(cleanedHTML).replace(/\\([*#_~`>])/g, "$1");
}

export default WikipediaNote;
