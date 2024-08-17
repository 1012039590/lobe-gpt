import { sha256 } from 'js-sha256';
import { StateCreator } from 'zustand/vanilla';

import { fileService } from '@/services/file';
import { ServerService } from '@/services/file/server';
import { uploadService } from '@/services/upload';
import { FileMetadata, UploadFileItem } from '@/types/files';

import { FileStore } from '../../store';

const serverFileService = new ServerService();

export interface FileUploadAction {
  uploadWithProgress: (params: {
    file: File;
    knowledgeBaseId?: string;
    onStatusUpdate: (data: {
      id: string;
      type: 'updateFile';
      value: Partial<UploadFileItem>;
    }) => void;
  }) => Promise<{ id: string; url: string }>;
}

export const createFileUploadSlice: StateCreator<
  FileStore,
  [['zustand/devtools', never]],
  [],
  FileUploadAction
> = () => ({
  uploadWithProgress: async ({ file, onStatusUpdate, knowledgeBaseId }) => {
    const fileArrayBuffer = await file.arrayBuffer();
    // 1. check file hash
    const hash = sha256(fileArrayBuffer);

    const checkStatus = await serverFileService.checkFileHash(hash);
    let metadata: FileMetadata;

    // 2. if file exist, just skip upload
    if (checkStatus.isExist) {
      metadata = checkStatus.metadata as FileMetadata;
      onStatusUpdate({
        id: file.name,
        type: 'updateFile',
        value: { status: 'processing', uploadState: { progress: 100, restTime: 0, speed: 0 } },
      });
    } else {
      // 2. if file don't exist, need upload files
      metadata = await uploadService.uploadWithProgress(file, (status, upload) => {
        onStatusUpdate({
          id: file.name,
          type: 'updateFile',
          value: { status: status === 'success' ? 'processing' : status, uploadState: upload },
        });
      });
    }

    // 3. use more powerful file type detector to get file type
    let fileType = file.type;

    if (!file.type) {
      const { fileTypeFromBuffer } = await import('file-type');

      const type = await fileTypeFromBuffer(fileArrayBuffer);
      fileType = type?.mime || 'text/plain';
    }

    // 4. create file to db
    const data = await fileService.createFile(
      {
        createdAt: Date.now(),
        fileType,
        hash,
        metadata,
        name: file.name,
        saveMode: 'url',
        size: file.size,
        url: metadata.path,
      },
      knowledgeBaseId,
    );

    onStatusUpdate({
      id: file.name,
      type: 'updateFile',
      value: {
        fileUrl: data.url,
        id: data.id,
        status: 'success',
        uploadState: { progress: 100, restTime: 0, speed: 0 },
      },
    });

    return data;
  },
});
