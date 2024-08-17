// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDBInstance } from '@/database/server/core/dbForTest';
import { FilesTabs, SortType } from '@/types/files';

import { files, users } from '../../schemas/lobechat';
import { FileModel } from '../file';

let serverDB = await getTestDBInstance();

vi.mock('@/database/server/core/db', async () => ({
  get serverDB() {
    return serverDB;
  },
}));

const userId = 'file-model-test-user-id';
const fileModel = new FileModel(userId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: 'user2' }]);
});

afterEach(async () => {
  await serverDB.delete(users);
  await serverDB.delete(files);
});

describe('FileModel', () => {
  it('should create a new file', async () => {
    const params = {
      name: 'test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 100,
      fileType: 'text/plain',
    };

    const { id } = await fileModel.create(params);
    expect(id).toBeDefined();

    const file = await serverDB.query.files.findFirst({ where: eq(files.id, id) });
    expect(file).toMatchObject({ ...params, userId });
  });

  it('should delete a file by id', async () => {
    const { id } = await fileModel.create({
      name: 'test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 100,
      fileType: 'text/plain',
    });

    await fileModel.delete(id);

    const file = await serverDB.query.files.findFirst({ where: eq(files.id, id) });
    expect(file).toBeUndefined();
  });

  it('should clear all files for the user', async () => {
    await fileModel.create({
      name: 'test-file-1.txt',
      url: 'https://example.com/test-file-1.txt',
      size: 100,
      fileType: 'text/plain',
    });
    await fileModel.create({
      name: 'test-file-2.txt',
      url: 'https://example.com/test-file-2.txt',
      size: 200,
      fileType: 'text/plain',
    });

    await fileModel.clear();

    const userFiles = await serverDB.query.files.findMany({ where: eq(files.userId, userId) });
    expect(userFiles).toHaveLength(0);
  });

  describe('Query', () => {
    const sharedFileList = [
      {
        name: 'document.pdf',
        url: 'https://example.com/document.pdf',
        size: 1000,
        fileType: 'application/pdf',
        userId,
      },
      {
        name: 'image.jpg',
        url: 'https://example.com/image.jpg',
        size: 500,
        fileType: 'image/jpeg',
        userId,
      },
      {
        name: 'audio.mp3',
        url: 'https://example.com/audio.mp3',
        size: 2000,
        fileType: 'audio/mpeg',
        userId,
      },
    ];

    it('should query files for the user', async () => {
      await fileModel.create({
        name: 'test-file-1.txt',
        url: 'https://example.com/test-file-1.txt',
        size: 100,
        fileType: 'text/plain',
      });
      await fileModel.create({
        name: 'test-file-2.txt',
        url: 'https://example.com/test-file-2.txt',
        size: 200,
        fileType: 'text/plain',
      });
      await serverDB.insert(files).values({
        name: 'audio.mp3',
        url: 'https://example.com/audio.mp3',
        size: 2000,
        fileType: 'audio/mpeg',
        userId: 'user2',
      });

      const userFiles = await fileModel.query();
      expect(userFiles).toHaveLength(2);
      expect(userFiles[0].name).toBe('test-file-2.txt');
      expect(userFiles[1].name).toBe('test-file-1.txt');
    });

    it('should filter files by name', async () => {
      await serverDB.insert(files).values(sharedFileList);
      const filteredFiles = await fileModel.query({ q: 'DOC' });
      expect(filteredFiles).toHaveLength(1);
      expect(filteredFiles[0].name).toBe('document.pdf');
    });

    it('should filter files by category', async () => {
      await serverDB.insert(files).values(sharedFileList);

      const imageFiles = await fileModel.query({ category: FilesTabs.Images });
      expect(imageFiles).toHaveLength(1);
      expect(imageFiles[0].name).toBe('image.jpg');
    });

    it('should sort files by name in ascending order', async () => {
      await serverDB.insert(files).values(sharedFileList);

      const sortedFiles = await fileModel.query({ sortType: SortType.Asc, sorter: 'name' });
      expect(sortedFiles[0].name).toBe('audio.mp3');
      expect(sortedFiles[2].name).toBe('image.jpg');
    });

    it('should sort files by size in descending order', async () => {
      await serverDB.insert(files).values(sharedFileList);

      const sortedFiles = await fileModel.query({ sortType: SortType.Desc, sorter: 'size' });
      expect(sortedFiles[0].name).toBe('audio.mp3');
      expect(sortedFiles[2].name).toBe('image.jpg');
    });

    it('should combine filtering and sorting', async () => {
      await serverDB.insert(files).values([
        ...sharedFileList,
        {
          name: 'big_document.pdf',
          url: 'https://example.com/big_document.pdf',
          size: 5000,
          fileType: 'application/pdf',
          userId,
        },
      ]);

      const filteredAndSortedFiles = await fileModel.query({
        category: FilesTabs.Documents,
        sortType: SortType.Desc,
        sorter: 'size',
      });

      expect(filteredAndSortedFiles).toHaveLength(2);
      expect(filteredAndSortedFiles[0].name).toBe('big_document.pdf');
      expect(filteredAndSortedFiles[1].name).toBe('document.pdf');
    });

    it('should return an empty array when no files match the query', async () => {
      await serverDB.insert(files).values(sharedFileList);
      const noFiles = await fileModel.query({ q: 'nonexistent' });
      expect(noFiles).toHaveLength(0);
    });

    it('should handle invalid sort field gracefully', async () => {
      await serverDB.insert(files).values(sharedFileList);

      const result = await fileModel.query({
        sortType: SortType.Asc,
        sorter: 'invalidField' as any,
      });
      expect(result).toHaveLength(3);
      // Should default to sorting by createdAt in descending order
    });
  });

  it('should find a file by id', async () => {
    const { id } = await fileModel.create({
      name: 'test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 100,
      fileType: 'text/plain',
    });

    const file = await fileModel.findById(id);
    expect(file).toMatchObject({
      id,
      name: 'test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 100,
      fileType: 'text/plain',
      userId,
    });
  });

  it('should update a file', async () => {
    const { id } = await fileModel.create({
      name: 'test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 100,
      fileType: 'text/plain',
    });

    await fileModel.update(id, { name: 'updated-test-file.txt', size: 200 });

    const updatedFile = await serverDB.query.files.findFirst({ where: eq(files.id, id) });
    expect(updatedFile).toMatchObject({
      id,
      name: 'updated-test-file.txt',
      url: 'https://example.com/test-file.txt',
      size: 200,
      fileType: 'text/plain',
      userId,
    });
  });
});
