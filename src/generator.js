const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const artTemplate = require('art-template');
const chalk = require('chalk');
const inquirer = require('inquirer');

// 颜色辅助函数
const success = text => chalk.green(text);
const error = text => chalk.red(text);
const warning = text => chalk.yellow(text);
const info = text => chalk.blue(text);

class Generator {
  constructor(config) {
    this.config = config;
    this.apis = [];
  }

  async init() {
    const spinner = require('ora')('加载 OpenAPI 数据...').start();
    try {
      const response = await axios.get(this.config.openapiUrl);
      this.apis = this.parseApis(response.data);
      spinner.succeed(success('✔ OpenAPI 数据加载成功'));
    } catch (e) {
      spinner.fail(error(`✖ OpenAPI 请求失败: ${e.message}`));
      throw e;
    }
  }

  parseApis(openapiData) {
    const paths = openapiData.paths || {};
    const schemas = openapiData.components?.schemas || {};

    return Object.entries(paths).map(([path, methods]) => {
      const methodsArray = Object.keys(methods);
      const firstMethod = Object.values(methods)[0] || {};
      const tags = (firstMethod.tags || []).join('-');
      const name = firstMethod.summary || firstMethod.description || firstMethod.operationId || path.split('/').pop();

      // 解析请求体schema
      let requestBody = null;
      if (firstMethod.requestBody?.content?.['application/json']?.schema) {
        const schema = firstMethod.requestBody.content['application/json'].schema;
        requestBody = this.resolveSchema(schema, schemas);
      }

      // 解析响应体schema
      let responseBody = null;
      if (firstMethod.responses?.['200']?.content?.['*/*']?.schema) {
        const schema = firstMethod.responses['200'].content['*/*'].schema;
        responseBody = this.resolveSchema(schema, schemas);
      }

      const apiPath = path.slice(1).replace(/\//g, '_');

      return {
        name,
        path,
        tags,
        methods: methodsArray,
        requestBody,
        responseBody,
        apiPath
      }
    });
  }

  resolveSchema(schema, schemas) {
    if (schema.$ref) {
      const refPath = schema.$ref.split('/').pop();
      schema = schemas[refPath];
    }

    if (schema.type === 'object') {
      const properties = {};
      const required = schema.required || [];

      Object.entries(schema.properties || {}).forEach(([key, prop]) => {
        properties[key] = {
          type: prop.type,
          title: prop.title || key,
          description: prop.description || '',
          required: required.includes(key),
          format: prop.format
        };
      });

      return properties;
    }

    return null;
  }

  async generateFile(templatePath, data, outputPath, options = {}) {
    try {
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }

      let template = fs.readFileSync(templatePath, 'utf-8');

      // 打印模板渲染数据
      console.log(info('\n模板渲染数据:'), JSON.stringify(data, null, 2));

      const content = artTemplate.render(template, data);

      if (fs.existsSync(outputPath) && !options.overwriteAll) {
        const { overwrite } = await inquirer.prompt([{
          type: 'confirm',
          name: 'overwrite',
          message: warning(`文件已存在: ${outputPath}\n是否覆盖?`),
          default: false
        }]);

        if (!overwrite) {
          console.log(warning('\n⚠ 用户取消了文件生成'));
          return false;
        }
      }
      
      fs.ensureDirSync(path.dirname(outputPath));
      fs.writeFileSync(outputPath, content);
      return true;
    } catch (e) {
      const errorMessage = e.code === 'EACCES' ? 
        `文件生成失败: 没有写入权限 (${outputPath})` :
        e.code === 'ENOENT' ? 
        `文件生成失败: 路径不存在 (${outputPath})` :
        `文件生成失败: ${e.message}`;
      
      throw new Error(errorMessage);
    }
  }

  generate(api, type, customPath) {
    const basePath = customPath || `${this.config.outputDir}${api.path}`;
    const templatePath = this.config.templates[type];
    
    let outputPath;
    // 移除路径中可能存在的.vue后缀
    const cleanBasePath = basePath.endsWith('.vue') ? basePath.slice(0, -4) : basePath;
    
    switch(type) {
      case 'filter':
      case 'modal':
        // 检查路径中是否已经包含components
        outputPath = cleanBasePath.includes('/components/') 
          ? `${cleanBasePath}.vue`
          : `${cleanBasePath}/components/${type}.vue`;
        break;
      default:
        outputPath = `${cleanBasePath}.vue`;
    }

    const result = this.generateFile(templatePath, { api }, outputPath);
    if (result === false) {
      return false;
    }
    return outputPath;
  }

  async batchGenerate(apis, types) {
    const fileList = [];
    
    // 收集所有将要生成的文件路径
    for (const api of apis) {
      for (const type of types) {
        const basePath = `${this.config.outputDir}${api.path}`;
        const templatePath = this.config.templates[type];
        
        const cleanBasePath = basePath.endsWith('.vue') ? basePath.slice(0, -4) : basePath;
        let outputPath;
        switch(type) {
          case 'filter':
          case 'modal':
            outputPath = cleanBasePath.includes('/components/') 
              ? `${cleanBasePath}.vue`
              : `${cleanBasePath}/components/${type}.vue`;
            break;
          default:
            outputPath = `${cleanBasePath}.vue`;
        }

        fileList.push({
          api,
          type,
          templatePath,
          outputPath
        });
      }
    }

    // 检查是否有文件已存在
    const existingFiles = fileList.filter(({ outputPath }) => fs.existsSync(outputPath));
    let overwriteAll = false;
    
    if (existingFiles.length > 0) {
      console.log(warning('\n以下文件已存在:'));
      existingFiles.forEach(({ outputPath }) => console.log(warning(outputPath)));
      
      const { overwriteChoice } = await inquirer.prompt([{
        type: 'list',
        name: 'overwriteChoice',
        message: warning('如何处理已存在的文件?'),
        choices: [
          { name: '全部覆盖', value: 'all' },
          { name: '取消生成', value: 'cancel' }
        ]
      }]);

      if (overwriteChoice === 'cancel') {
        throw new Error('用户取消了批量生成');
      }
      
      overwriteAll = overwriteChoice === 'all';
    }

    // 批量生成文件
    const results = [];
    const spinner = require('ora')('正在批量生成文件...').start();
    const total = fileList.length;
    let current = 0;

    for (const { api, type, templatePath, outputPath } of fileList) {
      try {
        await this.generateFile(templatePath, { api }, outputPath, {
          overwriteAll
        });
        results.push({
          success: true,
          outputPath,
          type
        });
      } catch (e) {
        results.push({
          success: false,
          outputPath,
          type,
          error: e.message
        });
      }
      current++;
      spinner.text = info(`正在批量生成文件... (${current}/${total})`);
    }

    spinner.stop();
    return results;
  }
}

module.exports = Generator;