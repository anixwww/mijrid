export {
  MAIN_TREE_ID,
  TREES_CHANGED_EVENT,
  notifyTreesChanged,
  hasUnsyncedFirebaseChangesStorage,
  setUnsyncedFirebaseChangesStorage,
  getLastFirebaseSyncTimeStorage,
  setLastFirebaseSyncTimeStorage,
  normalizeTreeId,
  getLocalGlobalVersion,
  hasDirtyGlobalVersion,
  setLocalGlobalVersion,
  saveTreeLocally,
  saveTreeToLocalStorage,
  pickNewestTreeData,
  loadTreeFromLocalStorage,
  downloadTreeJson,
  parseTreeJsonFile,
} from './localTreeStorage';
export type { LocalTreeIndexItem, ServerTreeMeta } from './localTreeStorage';

export {
  compressImageFile,
  uploadFileToServerDetailed,
  uploadFileToServer,
} from './mediaUploadClient';
export type { UploadFileResult, UploadFileOptions } from './mediaUploadClient';

export {
  invalidateTreeListCaches,
  fetchGlobalVersionFromServer,
  syncGlobalVersionToServer,
  syncTreeToServer,
  syncTreeToCloudAndServer,
  syncPendingDirtyTrees,
  checkServerHealth,
  fetchServerTreeMeta,
  loadTreeById,
  loadTreeFromServerOrStorage,
  syncCrossCanvasLinkTitles,
  fetchServerTrees,
  fetchAllTreesSearchIndex,
  deleteTreeFromServerOrStorage,
  renameTreeOnServerOrStorage,
  submitGuestSuggestionToServer,
  submitGuestCustomizeToServer,
} from './treeServerApi';
export type {
  CrossCanvasSearchTree,
  GuestCustomizePayload,
  GuestCustomizeResponse,
} from './treeServerApi';

export {
  pushAllTreesToFirestoreManual,
  pullAllTreesFromFirestoreManual,
} from './firebaseSyncClient';
export type {
  ManualFirebasePushResult,
  ManualFirebasePullResult,
} from './firebaseSyncClient';
