export const SYSTEM_THEME = 'system';
export type ThemeName = string;

export const themeState = $state({
	selected: SYSTEM_THEME as ThemeName,
	systemDark: false
});

export function isThemeName(value: string): value is ThemeName {
	return value.length > 0;
}

export function resolvedTheme(): string {
	return themeState.selected === SYSTEM_THEME
		? themeState.systemDark
			? 'dark'
			: 'light'
		: themeState.selected;
}

export function setTheme(value: string) {
	if (!isThemeName(value)) return;
	themeState.selected = value;
	try {
		localStorage.setItem('floodnav-theme', value);
	} catch {
		// Theme persistence is optional.
	}
}
