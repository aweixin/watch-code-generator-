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

  /**
   * 创建自定义API
   * @param {Object} customApi - 自定义API信息
   * @returns {Object} - 创建的API对象
   */
  createCustomApi(customApi) {
    const apiPath = customApi.path.slice(1).replace(/\//g, '_');
    const api = this.config.apiRefactor({
      name: customApi.name,
      path: customApi.path,
      apiPath,
      tags: customApi.tags || '',
      methods: customApi.methods || ['get'],
      requestBody: customApi.parameters ? this.formatParameters(customApi.parameters) : null,
      responseBody: customApi.responseFields ? this.formatParameters(customApi.responseFields) : null,
      parameters: customApi.parameters || []
    });
    
    this.apis.push(api);
    return api;
  }
  
  /**
   * 格式化参数为API所需格式
   * @param {Array} parameters - 参数数组
   * @returns {Object} - 格式化后的参数对象
   */
  formatParameters(parameters) {
    const properties = {};
    
    parameters.forEach(param => {
      properties[param.name] = {
        type: param.type || 'string',
        title: param.title || param.name,
        description: param.description || '',
        required: param.required || false,
        format: param.format || ''
      };
    });
    
    return properties;
  }

  async init() {
    const spinner = require('ora')('加载 OpenAPI 数据...').start();
    try {
      const response = await axios.get(this.config.openapiUrl);
      this.apis = this.parseApis(response.data);
      spinner.succeed(success('✔ OpenAPI 数据加载成功'));
    } catch (e) {
      spinner.fail(error(`✖ OpenAPI 请求失败: ${e.message}`));
      if (e.code === 'ENOTFOUND') {
        console.log(warning('  可能原因: 网络连接问题或URL不正确'));
        console.log(info('  建议: 检查网络连接和OpenAPI URL配置'));
      } else if (e.response && e.response.status) {
        console.log(warning(`  服务器返回状态码: ${e.response.status}`));
        console.log(info('  建议: 检查API密钥或访问权限'));
      }
      throw e;
    }
  }

  async generatePermission(permissions) {
    const spinner = require('ora')('正在生成权限类型定义...').start();

    try {
      if (!Array.isArray(permissions) || permissions.length === 0) {
        throw new Error('请提供权限列表数组');
      }
  
      const enumObject = permissions.reduce((acc, curr) => {
        const key = curr
          .replace(/^\//, '')
          .replace(/\//g, '_');
        
        acc[key] = `'${curr}'`
        return acc
      }, {});
  
      const typeContent = `// Auto-generated by generatePermissionTypes
export const PermissionEnums = {
    ${Object.entries(enumObject)
      .map(([key, value]) => `${key}: ${value}`)
      .join(',\n  ')}
  } as const;
  
export type PermissionType = typeof PermissionEnums[keyof typeof PermissionEnums]

declare module 'vue' {
    export interface ComponentCustomProperties {
        $hasPermission: (permission: PermissionType) => boolean;
    }
}

// 为指令声明类型
declare module '@vue/runtime-core' {
    export interface HTMLAttributes {
        'v-permission'?: PermissionType | PermissionType[];
    }
}
  `

      const typesPath = path.join(process.cwd(), 'src', 'permissions.ts');
      fs.ensureDirSync(path.dirname(typesPath));
      fs.writeFileSync(typesPath, typeContent, 'utf8');
      
      spinner.succeed(success('✔ 权限类型定义文件生成成功：src/permissions.ts'));

    } catch (error) {
      spinner.fail(error('生成权限类型定义文件失败:', error));
    }
  }


  parseApis(openapiData) {
    const permissions = Object.keys(openapiData.paths || {});
    // 生成权限类型定义文件
    this.generatePermission(permissions);
    // 解析OpenAPI数据
    const paths = openapiData.paths || {};
    const schemas = openapiData.components?.schemas || {};

    return Object.entries(paths).map(([path, methods]) => {
      const methodsArray = Object.keys(methods);
      const firstMethod = Object.values(methods)[0] || {};
      const tags = (firstMethod.tags || []).join('-');
      const name = firstMethod.summary || firstMethod.description || firstMethod.operationId || path.split('/').pop();

      // 解析请求体schema
      let requestBody = null;
      let requestBodySchema = null;
      if (firstMethod.requestBody?.content?.['application/json']?.schema) {
        const schema = firstMethod.requestBody.content['application/json'].schema;
        requestBodySchema = schema;
        requestBody = this.resolveSchema(schema, schemas);
      }

      // 解析响应体schema
      let responseBody = null;
      let responseBodySchema = null;
      if (firstMethod.responses?.['200']?.content?.['*/*']?.schema) {
        const schema = firstMethod.responses['200'].content['*/*'].schema;
        responseBodySchema = schema;
        responseBody = this.resolveSchema(schema, schemas);
      }

      const apiPath = path.slice(1).replace(/\//g, '_');
      return this.config.apiRefactor({
          name,
          path,
          apiPath,
          requestBodySchema, // 存储原始schema
          responseBodySchema, // 存储原始schema
          tags,
          methods: methodsArray,
          requestBody,
          responseBody,
      },paths);
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



      // 从文件路径生成路由路径
      data.routeName = outputPath
      .replace(/^.*?src\/views/, '') // 移除 src/views 前的所有内容
      .replace(/\.page\.vue$/, '')   // 移除 .page.vue 后缀
      .replace(/\.vue$/, '');        // 移除 .vue 后缀

      if (!data.routeName.startsWith('/')) {
        data.routeName = '/' + data.routeName;
      }


      // 打印模板渲染数据
      console.log(info('\n模板渲染数据:'), JSON.stringify(data, null, 2));
      // 打印路径
      console.log(info('\n文件路径:'), outputPath);

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
    const templatePath = process.cwd() + this.config.templates[type];
    const suffix = this.config.fileSuffix[type];
    
    let outputPath;
    // 移除路径中可能存在的.vue后缀
    const cleanBasePath = basePath.replace(/\.[^/.]+$/, '');
    
    switch(type) {
      case 'filter':
      case 'modal':
        const fileName = `${api.apiPath}_${type}${suffix}`;
        outputPath = cleanBasePath.includes('/components/') 
          ? `${cleanBasePath}${suffix}`
          : `${path.dirname(cleanBasePath)}/components/${fileName}`;
        break;
      default:
        outputPath = `${cleanBasePath}${suffix}`;
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
        const suffix = this.config.fileSuffix[type];
        
        const cleanBasePath = basePath.replace(/\.[^/.]+$/, '');
        let outputPath;
        switch(type) {
          case 'filter':
          case 'modal':
            const fileName = `${api.apiPath}_${type}${suffix}`;
            outputPath = cleanBasePath.includes('/components/') 
              ? `${cleanBasePath}${suffix}`
              : `${path.dirname(cleanBasePath)}/components/${fileName}`;
            break;
          default:
            outputPath = `${cleanBasePath}${suffix}`;
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