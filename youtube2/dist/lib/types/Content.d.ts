import { type ContentItem, type PageElement } from '.';
import { type BrowseContinuationEndpoint, type BrowseEndpoint, type EndpointType, type SearchContinuationEndpoint, type SearchEndpoint, type WatchContinuationEndpoint, type WatchEndpoint } from './Endpoint';
export type ContentOf<T> = T extends BrowseEndpoint | BrowseContinuationEndpoint | SearchEndpoint | SearchContinuationEndpoint ? PageContent : T extends WatchEndpoint ? WatchContent : T extends WatchContinuationEndpoint ? WatchContinuationContent : never;
export interface PageContent {
    type: 'page';
    isContinuation: boolean;
    header?: PageElement.Header;
    sections: PageElement.Section[];
    tabs?: PageElement.Tab[];
}
export interface WatchContent {
    type: 'watch';
    isContinuation: false;
    playlist?: ContentItem.Playlist;
    autoplay?: WatchEndpoint;
    related?: {
        items: (ContentItem.Video | ContentItem.Playlist)[];
        continuation?: PageElement.Continuation<EndpointType.WatchContinuation>;
    };
}
export interface WatchContinuationContent {
    type: 'watch';
    isContinuation: true;
    items: (ContentItem.Video | ContentItem.Playlist)[];
    continuation?: PageElement.Continuation<EndpointType.WatchContinuation>;
}
//# sourceMappingURL=Content.d.ts.map