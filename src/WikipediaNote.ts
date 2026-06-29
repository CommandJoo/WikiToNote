import {WikiPluginSettings} from "./PluginSettings";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import {Notice, requestUrl} from "obsidian";

class WikipediaNote {
	private settings: WikiPluginSettings;

	constructor(settings: WikiPluginSettings) {
		this.settings = settings;
	}

	async create(article: string) {
		const title = `${article.replace(/[^\p{L}\p{N}]/gu, "_")}`;
		const content = `---\n
tags:
- wikipedia-note
---\n
# ${article}\n
___\n
${await fetchWikipediaMarkdown(article, this.settings)}
`
		await createAndOpenNote(title, content)
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

async function fetchWikipediaMarkdown(title: string, settings: WikiPluginSettings) {
	const $ = await cleanWikiHtml(title, settings.countryPrefix);
	if (!$) return;

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

	$("table").each((_, table) => {
		const $table = $(table);

		$table.find("img").each((_, img) => {
			const newImg = $(img);
			let src = $(img).attr("src");
			if (src && src.startsWith("//")) {
				src = `https:${src}`;
				newImg.attr("src", src);
			}

			let srcset = $(img).attr("srcset");
			if (srcset && srcset.startsWith("//")) {
				srcset = `https:${srcset}`;
				newImg.attr("srcset", srcset);
			}

			$(img).replaceWith(newImg);
		});
		$table.css("background-color", settings.tableBackground);
		$table.css("border", `1px solid ${settings.tableBackground}`);
		$table.css("overflow", "scroll");
		$table.replaceWith($table);

		$table.removeAttr("cellpadding");
		$table.removeAttr("summary");
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

	const cleanedHTML = $.html();
	const turndownService = new TurndownService();
	turndownService.keep("table")
	turndownService.addRule("figures", {
		filter: "span",
		replacement: (content, node) => {
			if (node) {
				if ("classList" in node && node?.classList.contains("figure")) {
					const serializer = new XMLSerializer();
					return serializer.serializeToString(node);
				}
			}
			return "";
		}
	})
	turndownService.addRule('underscoreHeaders', {
		filter: ['h1', 'h2'],
		replacement: function (content, node) {
			const level = node.nodeName.toLowerCase() === 'h1' ? 1 : 2;
			const underlineChar = '_';
			return `${"#".repeat(level)} ${content}\n${underlineChar.repeat(content.length)}\n`;
		}
	});

	return turndownService.turndown(cleanedHTML).replace(/\\([*#_~`>])/g, "$1");
}

export default WikipediaNote;
