import { produce } from 'immer';
import useSWR, { SWRResponse } from 'swr';
import { StateCreator } from 'zustand/vanilla';

import { fileService } from '@/services/file';
import { ServerService } from '@/services/file/server';
import { ragService } from '@/services/rag';
import { userService } from '@/services/user';
import { useAgentStore } from '@/store/agent';
import {
  UploadFileListDispatch,
  uploadFileListReducer,
} from '@/store/file/reducers/uploadFileList';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';
import { FileListItem, FilePreview } from '@/types/files';
import { UploadFileItem } from '@/types/files/upload';
import { sleep } from '@/utils/sleep';
import { setNamespace } from '@/utils/storeDebug';

import { FileStore } from '../../store';

const n = setNamespace('chat');

const serverFileService = new ServerService();

export interface FileAction {
  clearChatUploadFileList: () => void;
  dispatchChatUploadFileList: (payload: UploadFileListDispatch) => void;

  removeChatUploadFile: (id: string) => Promise<void>;
  startAsyncTask: (
    fileId: string,
    runner: (id: string) => Promise<string>,
    onFileItemChange: (fileItem: FileListItem) => void,
  ) => Promise<void>;

  uploadChatFiles: (files: File[]) => Promise<void>;

  /**
   * en: delete it after refactoring the Dalle plugin
   * @deprecated
   */
  useFetchFile: (id: string) => SWRResponse<FilePreview>;
}

export const createFileSlice: StateCreator<
  FileStore,
  [['zustand/devtools', never]],
  [],
  FileAction
> = (set, get) => ({
  clearChatUploadFileList: () => {
    set({ chatUploadFileList: [] }, false, n('clearChatUploadFileList'));
  },
  dispatchChatUploadFileList: (payload) => {
    const nextValue = uploadFileListReducer(get().chatUploadFileList, payload);
    if (nextValue === get().chatUploadFileList) return;

    set({ chatUploadFileList: nextValue }, false, `dispatchChatFileList/${payload.type}`);
  },
  removeChatUploadFile: async (id) => {
    const { dispatchChatUploadFileList } = get();

    dispatchChatUploadFileList({ id, type: 'removeFile' });
    await fileService.removeFile(id);
  },

  startAsyncTask: async (id, runner, onFileItemUpdate) => {
    await runner(id);

    let isFinished = false;

    while (!isFinished) {
      // 每间隔 2s 查询一次任务状态
      await sleep(2000);

      let fileItem: FileListItem | undefined = undefined;

      try {
        fileItem = await serverFileService.getFileItem(id);
      } catch (e) {
        console.error('getFileItem Error:', e);
        continue;
      }

      if (!fileItem) return;

      onFileItemUpdate(fileItem);

      if (fileItem.finishEmbedding) {
        isFinished = true;
      }

      // if error, also break
      else if (fileItem.chunkingStatus === 'error' || fileItem.embeddingStatus === 'error') {
        isFinished = true;
      }
    }
  },

  uploadChatFiles: async (files) => {
    const { dispatchChatUploadFileList, startAsyncTask } = get();

    // 1. add files with base64
    const uploadFiles: UploadFileItem[] = await Promise.all(
      files.map(async (file) => {
        let previewUrl: string | undefined = undefined;
        let base64Url: string | undefined = undefined;

        // only image and video can be previewed, we create a previewUrl and base64Url for them
        if (file.type.startsWith('image') || file.type.startsWith('video')) {
          const data = await file.arrayBuffer();

          previewUrl = URL.createObjectURL(new Blob([data!], { type: file.type }));

          const base64 = Buffer.from(data!).toString('base64');
          base64Url = `data:${file.type};base64,${base64}`;
        }

        return { base64Url, file, id: file.name, previewUrl, status: 'pending' } as UploadFileItem;
      }),
    );

    dispatchChatUploadFileList({ files: uploadFiles, type: 'addFiles' });

    // upload files and process it
    const pools = files.map(async (file) => {
      const fileResult = await get().uploadWithProgress({
        file,
        onStatusUpdate: dispatchChatUploadFileList,
      });

      // image don't need to be chunked and embedding
      if (file.type.startsWith('image')) return;

      // 3. auto chunk and embedding
      dispatchChatUploadFileList({
        id: fileResult.id,
        type: 'updateFile',
        // make the taks empty to hint the user that the task is starting but not triggered
        value: { tasks: {} },
      });

      await startAsyncTask(
        fileResult.id,
        async (id) => {
          const data = await ragService.createParseFileTask(id);
          if (!data || !data.id) throw new Error('failed to createParseFileTask');

          // run the assignment
          useAgentStore
            .getState()
            .addFilesToAgent([id], false)
            .then(() => {
              // trigger the tip if it's the first time
              if (!preferenceSelectors.shouldTriggerFileInKnowledgeBaseTip(useUserStore.getState()))
                return;

              userService.updateGuide({ uploadFileInKnowledgeBase: true });
            });

          return data.id;
        },

        (fileItem) => {
          dispatchChatUploadFileList({
            id: fileResult.id,
            type: 'updateFile',
            value: {
              tasks: {
                chunkCount: fileItem.chunkCount,
                chunkingError: fileItem.chunkingError,
                chunkingStatus: fileItem.chunkingStatus,
                embeddingError: fileItem.embeddingError,
                embeddingStatus: fileItem.embeddingStatus,
                finishEmbedding: fileItem.finishEmbedding,
              },
            },
          });
        },
      );
    });

    await Promise.all(pools);
  },

  useFetchFile: (id) =>
    useSWR(id, async (id) => {
      const item = await fileService.getFile(id);

      set(
        produce((draft) => {
          if (draft.imagesMap[id]) return;

          draft.imagesMap[id] = item;
        }),
        false,
        n('useFetchFile'),
      );

      return item;
    }),
});
