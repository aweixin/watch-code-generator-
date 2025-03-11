# watch-code-generator

一个基于 OpenAPI 的 Vue 组件代码生成器。

## 安装

```bash
npm install -g watch-code-generator
```

## 创建 codegen.config.js 文件
```js
module.exports = {
  openapiUrl: 'https://api.apifox.com/v3/projects/xxx/openapi.json',
  templates: {
    list: './templates/list.art',
    form: './templates/form.art',
    filter: './templates/filter.art',
    modal: './templates/modal.art'
  },
  outputDir: '/view'
};
```
