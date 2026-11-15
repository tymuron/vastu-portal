export declare const DOOR_DATABASE: string;
export declare function onDoor(hostname: string): boolean;
export declare function databaseUrl(configured: string, hostname: string): string;
export declare function doorFileLink(url: string, configured: string, hostname: string): string;
export declare function doorSrcLink(url: string, configured: string, hostname: string): string;
export declare function doorTextLinks(text: string, hostname: string): string;
export declare function doorHtmlLinks(html: string, configured: string, hostname: string): string;
