/**
 * Shared FlatList virtualization props. Make scrolling smoother and reduce
 * memory in long lists (favorites, browse, queue) without changing behavior:
 * they only control how many items are mounted at once.
 */
export const listPerf = {
  removeClippedSubviews: true,
  initialNumToRender: 10,
  maxToRenderPerBatch: 10,
  windowSize: 11,
};
