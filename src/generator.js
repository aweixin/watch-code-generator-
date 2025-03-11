const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const artTemplate = require('art-template');
const chalk = require('chalk');

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
      spinner.succeed(chalk.green('✔ OpenAPI 数据加载成功'));
    } catch (e) {
      spinner.fail(chalk.red(`✖ OpenAPI 请求失败: ${e.message}`));
      throw e;
    }
  }

  parseApis(openapiData) {
    const paths = openapiData.paths || {};
    return Object.entries(paths).map(([path, methods]) => {
      const firstMethod = Object.values(methods)[0] || {};
      const name = firstMethod.summary || firstMethod.description || firstMethod.operationId || path.split('/').pop();
      return {
        name,
        path,
        methods: Object.keys(methods)
      };
    });
  }

  generateFile(templatePath, data, outputPath) {
    try {
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }
      
      // 在渲染前输出完整的数据对象
      console.log('\n=== 模板数据 ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('===============\n');
      
      const template = fs.readFileSync(templatePath, 'utf-8');
      const content = artTemplate.render(template, data);
      fs.ensureDirSync(path.dirname(outputPath));
      fs.writeFileSync(outputPath, content);
    } catch (e) {
      throw new Error(`文件生成失败: ${e.message}`);
    }
  }

  generate(api, type, customPath) {
    const basePath = customPath || `${this.config.outputDir}${api.path}`;
    const templatePath = this.config.templates[type];
    
    let outputPath;
    switch(type) {
      case 'filter':
        outputPath = `${basePath}/components/filter.vue`;
        break;
      case 'modal':
        outputPath = `${basePath}/components/modal.vue`;
        break;
      default:
        outputPath = `${basePath}.vue`;
    }

    this.generateFile(templatePath, { api }, outputPath);
    return outputPath;
  }
}

module.exports = Generator;