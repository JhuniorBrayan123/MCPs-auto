import { toolAuthorization, type ToolAuthorizationMap } from "mcp-cognito-avp";

export const TOOL_AUTHORIZATION_MAP: ToolAuthorizationMap = {
  bookstack_list_books: toolAuthorization({ action: "list", resourceType: "Book" }),
  bookstack_list_chapters: toolAuthorization({ action: "list", resourceType: "Chapter" }),
  bookstack_list_shelves: toolAuthorization({ action: "list", resourceType: "Shelf" }),
  bookstack_list_pages: toolAuthorization({ action: "list", resourceType: "Page" }),
  bookstack_search: toolAuthorization({ action: "search", resourceType: "Page" }),
  bookstack_get_book: toolAuthorization({ action: "view", resourceType: "Book", idArg: "bookId" }),
  bookstack_get_chapter: toolAuthorization({
    action: "view",
    resourceType: "Chapter",
    idArg: "chapterId",
  }),
  bookstack_get_shelf: toolAuthorization({ action: "view", resourceType: "Shelf", idArg: "shelfId" }),
  bookstack_get_page: toolAuthorization({ action: "view", resourceType: "Page", idArg: "pageId" }),
  bookstack_create_page: toolAuthorization({ action: "create", resourceType: "Page" }),
  bookstack_update_page: toolAuthorization({ action: "update", resourceType: "Page", idArg: "pageId" }),
};
