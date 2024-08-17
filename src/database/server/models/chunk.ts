import { asc, cosineDistance, count, eq, inArray, sql } from 'drizzle-orm';
import { and, desc } from 'drizzle-orm/expressions';

import { serverDB } from '@/database/server';
import { ChunkMetadata, FileChunk, SemanticSearchChunk } from '@/types/chunk';

import {
  NewChunkItem,
  NewUnstructuredChunkItem,
  chunks,
  embeddings,
  files,
  unstructuredChunks,
} from '../schemas/lobechat';

export class ChunkModel {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  create = async (params: NewChunkItem) => {
    return serverDB.insert(chunks).values(params);
  };

  bulkCreate = async (params: NewChunkItem[]) => {
    return serverDB.insert(chunks).values(params);
  };

  bulkCreateUnstructuredChunks = async (params: NewUnstructuredChunkItem[]) => {
    return serverDB.insert(unstructuredChunks).values(params);
  };

  delete = async (id: string) => {
    return serverDB.delete(chunks).where(and(eq(chunks.id, id), eq(chunks.userId, this.userId)));
  };

  query = async (fileId: string) => {
    return serverDB.query.chunks.findMany({
      orderBy: [desc(chunks.updatedAt)],
      where: eq(chunks.fileId, fileId),
    });
  };

  findById = async (id: string) => {
    return serverDB.query.chunks.findFirst({
      where: and(eq(chunks.fileId, id)),
    });
  };

  async findByFileIds(ids: string[]) {
    return serverDB.query.chunks.findMany({
      where: and(inArray(chunks.fileId, ids)),
    });
  }

  async findByFileId(id: string, page = 0) {
    const data = await serverDB.query.chunks.findMany({
      columns: {
        fileId: false,
        userId: false,
      },
      limit: 20,
      offset: page * 20,
      orderBy: [asc(chunks.index)],
      where: and(eq(chunks.fileId, id), eq(chunks.userId, this.userId)),
    });

    return data.map((item) => {
      const metadata = item.metadata as ChunkMetadata;

      return { ...item, metadata, pageNumber: metadata.pageNumber } as FileChunk;
    });
  }

  async getChunksTextByFileId(id: string): Promise<{ id: string; text: string }[]> {
    const data = await serverDB.query.chunks.findMany({
      where: eq(chunks.fileId, id),
    });

    return data
      .map((chunk) => ({ id: chunk.id, text: this.mapChunkText(chunk) }))
      .filter((chunk) => chunk.text) as { id: string; text: string }[];
  }

  async countByFileIds(ids: string[]) {
    if (ids.length === 0) return [];

    return serverDB
      .select({
        count: count(chunks.id),
        id: chunks.fileId,
      })
      .from(chunks)
      .where(inArray(chunks.fileId, ids))
      .groupBy(chunks.fileId);
  }

  async countByFileId(ids: string) {
    const data = await serverDB
      .select({
        count: count(chunks.id),
        id: chunks.fileId,
      })
      .from(chunks)
      .where(eq(chunks.fileId, ids))
      .groupBy(chunks.fileId);

    return data[0]?.count ?? 0;
  }

  async semanticSearch({
    embedding,
    fileIds,
  }: {
    embedding: number[];
    fileIds: string[] | undefined;
    query: string;
  }) {
    const similarity = sql<number>`1 - (${cosineDistance(embeddings.embeddings, embedding)})`;

    const data = await serverDB
      .select({
        id: chunks.id,
        index: chunks.index,
        metadata: chunks.metadata,
        similarity,
        text: chunks.text,
        type: chunks.type,
      })
      .from(chunks)
      .leftJoin(embeddings, eq(chunks.id, embeddings.chunkId))
      .where(fileIds ? inArray(chunks.fileId, fileIds) : undefined)
      .orderBy((t) => desc(t.similarity))
      .limit(30);

    return data.map(
      (item): SemanticSearchChunk => ({
        ...item,
        metadata: item.metadata as ChunkMetadata,
      }),
    );
  }

  async semanticSearchForChat({
    embedding,
    fileIds,
  }: {
    embedding: number[];
    fileIds: string[] | undefined;
    query: string;
  }) {
    const similarity = sql<number>`1 - (${cosineDistance(embeddings.embeddings, embedding)})`;

    const result = await serverDB
      .select({
        fileId: files.id,
        filename: files.name,
        id: chunks.id,
        index: chunks.index,
        metadata: chunks.metadata,
        similarity,
        text: chunks.text,
        type: chunks.type,
      })
      .from(chunks)
      .leftJoin(embeddings, eq(chunks.id, embeddings.chunkId))
      .leftJoin(files, eq(files.id, chunks.fileId))
      .where(and(fileIds && fileIds.length > 0 ? inArray(chunks.fileId, fileIds) : undefined))
      .orderBy((t) => desc(t.similarity))
      .limit(5);

    return result.map((item) => {
      return {
        id: item.id,
        index: item.index,
        similarity: item.similarity,
        text: this.mapChunkText(item),
      };
    });
  }

  private mapChunkText = (chunk: { metadata: any; text: string | null; type: string | null }) => {
    let text = chunk.text;

    if (chunk.type === 'Table') {
      text = `${chunk.text}

content in Table html is below:
${(chunk.metadata as ChunkMetadata).text_as_html}
`;
    }

    return text;
  };
}
