export type AppPresenceView = 'lobby' | 'menus';

export interface SetAppViewMessage {
  view: AppPresenceView;
}
