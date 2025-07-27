// a tuple that starts with a string, followed by any number of TreeItem elements
export type TreeItem = string | [string, ...TreeItem[]];