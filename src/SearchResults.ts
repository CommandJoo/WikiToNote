import {WikiPluginSettings} from "./PluginSettings";
import {requestUrl} from "obsidian";

function debounce<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	wait: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let latestResolve: ((value: any) => void) | null = null;

	return (...args: Parameters<T>) => {
		return new Promise((resolve) => {
			if (timeout) clearTimeout(timeout);
			latestResolve = resolve;
			timeout = setTimeout(async () => {
				const result = await fn(...args);
				if (latestResolve === resolve) resolve(result);
			}, wait);
		});
	};
}

async function fetchWikiSuggestions(
	query: string,
	limit = 10,
	settings: WikiPluginSettings
): Promise<{ title: string, description: string }[]> {
	if (!query.trim()) return [];

	const url = `https://${settings.countryPrefix}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
		query
	)}&limit=${limit}`;

	const response = await requestUrl({
		url,
		method: "GET",
		headers: {
			"User-Agent": "WikiToMarkdown/1.1",
		},
	});

	const data = response.json;

	return (data.pages ?? []).map((page: { title: string, description: string}) => ({
		title: page.title,
		description: page.description,
	}));
}


export const debouncedFetchSuggestions = debounce(fetchWikiSuggestions, 250);
