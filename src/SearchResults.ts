import {WikiPluginSettings} from "./PluginSettings";
import {requestUrl} from "obsidian";

function debounce<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
	wait: number
): (...args: TArgs) => Promise<TResult> {
	let timeout: number | undefined;
	let latestResolve: ((value: TResult) => void) | null = null;

	return (...args: TArgs) => {
		return new Promise<TResult>((resolve, reject) => {
			if (timeout !== undefined) {
				window.clearTimeout(timeout);
			}

			latestResolve = resolve;

			timeout = window.setTimeout(() => {
				void fn(...args)
					.then((result) => {
						if (latestResolve === resolve) {
							resolve(result);
						}
					})
					.catch(reject);
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
