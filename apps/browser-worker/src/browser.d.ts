import { type BrowserContext, type Page } from 'playwright';
export declare function getBrowserContext(): Promise<BrowserContext>;
export declare function closeBrowser(): Promise<void>;
export declare function openFreshPage(): Promise<Page>;
export declare function checkAuthStatus(page: Page): Promise<'authenticated' | 'requires_login'>;
export declare function saveDebugSnapshot(page: Page, label: string, projectId: string): Promise<void>;
//# sourceMappingURL=browser.d.ts.map