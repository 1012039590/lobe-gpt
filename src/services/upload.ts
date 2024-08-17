import { fileEnv } from '@/config/file';
import { DB_File } from '@/database/client/schemas/files';
import { edgeClient } from '@/libs/trpc/client';
import { API_ENDPOINTS } from '@/services/_url';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { FileMetadata } from '@/types/files';
import { FileUploadState, FileUploadStatus } from '@/types/files/upload';
import compressImage from '@/utils/compressImage';
import { uuid } from '@/utils/uuid';

class UploadService {
  async uploadFile(file: DB_File) {
    if (this.enableServer) {
      const { data, ...params } = file;
      const filename = `${uuid()}.${file.name.split('.').at(-1)}`;

      // 精确到以 h 为单位的 path
      const date = (Date.now() / 1000 / 60 / 60).toFixed(0);
      const dirname = `${fileEnv.NEXT_PUBLIC_S3_FILE_PATH}/${date}`;
      const pathname = `${dirname}/${filename}`;

      const url = await edgeClient.upload.createS3PreSignedUrl.mutate({ pathname });

      const res = await fetch(url, {
        body: data,
        headers: { 'Content-Type': file.fileType },
        method: 'PUT',
      });

      if (res.ok) {
        return {
          ...params,
          metadata: { date, dirname: dirname, filename: filename, path: pathname },
          name: file.name,
          saveMode: 'url',
          url: pathname,
        } as DB_File;
      } else {
        throw new Error('Upload Error');
      }
    }

    // 跳过图片上传测试
    const isTestData = file.size === 1;
    if (this.isImage(file.fileType) && !isTestData) {
      return this.uploadImageFile(file);
    }

    // save to local storage
    // we may want to save to a remote server later
    return file;
  }

  /**
   * @deprecated
   * @param url
   * @param file
   */
  async uploadImageByUrl(url: string, file: Pick<DB_File, 'name' | 'metadata'>) {
    const res = await fetch(API_ENDPOINTS.proxy, { body: url, method: 'POST' });
    const data = await res.arrayBuffer();
    const fileType = res.headers.get('content-type') || 'image/webp';

    return this.uploadFile({
      data,
      fileType,
      metadata: file.metadata,
      name: file.name,
      saveMode: 'local',
      size: data.byteLength,
    });
  }

  uploadWithProgress = async (
    file: File,
    onProgress: (status: FileUploadStatus, state: FileUploadState) => void,
  ): Promise<FileMetadata> => {
    const xhr = new XMLHttpRequest();

    const { preSignUrl, ...result } = await this.getSignedUploadUrl(file);

    let startTime = Date.now();
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Number(((event.loaded / event.total) * 100).toFixed(1));

        const speedInByte = event.loaded / ((Date.now() - startTime) / 1000);

        onProgress?.('uploading', {
          // if the progress is 100, it means the file is uploaded
          // but the server is still processing it
          // so make it as 99.9 and let users think it's still uploading
          progress: progress === 100 ? 99.9 : progress,
          restTime: (event.total - event.loaded) / speedInByte,
          speed: speedInByte / 1024,
        });
      }
    });

    xhr.open('PUT', preSignUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    const data = await file.arrayBuffer();

    await new Promise((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress('success', {
            progress: 100,
            restTime: 0,
            speed: file.size / ((Date.now() - startTime) / 1000),
          });
          resolve(xhr.response);
        } else {
          reject(xhr.statusText);
        }
      });
      xhr.addEventListener('error', () => reject(xhr.statusText));
      xhr.send(data);
    });

    return result;
  };

  private isImage(fileType: string) {
    const imageRegex = /^image\//;
    return imageRegex.test(fileType);
  }

  private async uploadImageFile(file: DB_File) {
    // 加载图片
    const url = file.url || URL.createObjectURL(new Blob([file.data!]));

    const img = new Image();
    img.src = url;
    await (() =>
      new Promise((resolve) => {
        img.addEventListener('load', resolve);
      }))();

    // 压缩图片
    const base64String = compressImage({ img, type: file.fileType });
    const binaryString = atob(base64String.split('base64,')[1]);
    const uint8Array = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    file.data = uint8Array.buffer;

    return file;
  }

  private get enableServer() {
    return serverConfigSelectors.enableUploadFileToServer(
      window.global_serverConfigStore.getState(),
    );
  }

  private getSignedUploadUrl = async (
    file: File,
  ): Promise<
    FileMetadata & {
      preSignUrl: string;
    }
  > => {
    const filename = `${uuid()}.${file.name.split('.').at(-1)}`;

    // 精确到以 h 为单位的 path
    const date = (Date.now() / 1000 / 60 / 60).toFixed(0);
    const dirname = `${fileEnv.NEXT_PUBLIC_S3_FILE_PATH}/${date}`;
    const pathname = `${dirname}/${filename}`;

    const preSignUrl = await edgeClient.upload.createS3PreSignedUrl.mutate({ pathname });

    return {
      date,
      dirname,
      filename,
      path: pathname,
      preSignUrl,
    };
  };
}

export const uploadService = new UploadService();
