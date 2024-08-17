export default {
  desc: '管理你的文件与知识库',
  detail: {
    basic: {
      createdAt: '创建时间',
      filename: '文件名',
      size: '文件大小',
      title: '基本信息',
      type: '格式',
      updatedAt: '更新时间',
    },
    data: {
      chunkCount: '分块数',
      embedding: {
        default: '暂未向量化',
        error: '失败',
        pending: '待启动',
        processing: '进行中',
        success: '已完成',
      },
      embeddingStatus: '向量化',
    },
  },
  header: {
    actions: {
      newFolder: '新建文件夹',
      uploadFile: '上传文件',
      uploadFolder: '上传文件夹',
    },
    uploadButton: '上传',
  },
  knowledgeBase: {
    list: {
      confirmRemoveKnowledgeBase:
        '即将删除该知识库，其中的文件不会删除，将移入全部文件中。知识库删除后将不可恢复，请谨慎操作。',
      empty: '点击 <1>+</1> 开始创建知识库',
    },
    new: '新建知识库',
    title: '知识库',
  },
  preview: {
    unsupportedFile: '此文件格式不支持在线预览',
  },
  searchFilePlaceholder: '搜索文件',
  tab: {
    all: '全部文件',
    audios: '语音',
    documents: '文档',
    images: '图片',
    videos: '视频',
    websites: '网页',
  },
  title: '文件',
  uploadDock: {
    body: {
      collapse: '收起',
      item: {
        done: '已上传',
        error: '上传失败，请重试',
        pending: '准备上传...',
        processing: '文件处理中...',
        restTime: '剩余 {{time}}',
      },
    },
    totalCount: '共 {{count}} 项',
    uploadStatus: {
      error: '上传出错',
      pending: '等待上传',
      processing: '正在上传',
      success: '上传完成',
      uploading: '正在上传',
    },
  },
};
