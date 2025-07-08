const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Generator = require('./generator');

// 颜色辅助函数
const success = text => chalk.green(text);
const error = text => chalk.red(text);
const warning = text => chalk.yellow(text);
const info = text => chalk.blue(text);
const title = text => chalk.bold.cyan(text);

class UI {
  static async start(generator) {
    this.generator = generator;
    await this.showMainMenu();
  }

  static async showMainMenu() {
    const choices = this.generator.apis.map((api, index) => ({
      name: `${api.name} (${warning(api.path)})`,
      value: index
    }));
    
    // 添加自定义API选项
    choices.push({
      name: chalk.bold.green('+ 添加自定义API'),
      value: 'custom'
    });

    // 添加筛选功能
    const { filter } = await inquirer.prompt([{
      type: 'input',
      name: 'filter',
      message: info('输入关键字筛选API (回车跳过):'),
      default: ''
    }]);

    // 根据关键字筛选API
    const filteredChoices = filter
      ? choices.filter(choice => {
          if (choice.value === 'custom') return true; // 保留自定义API选项
          const api = this.generator.apis[choice.value];
          return api.name.toLowerCase().includes(filter.toLowerCase()) ||
                 api.path.toLowerCase().includes(filter.toLowerCase()) ||
                 api.methods.some(m => m.toLowerCase().includes(filter.toLowerCase()));
        })
      : choices;

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'apiIndexes',
        message: info('请选择要生成的API (空格选择，回车确认，按a全选):'),
        choices: [
          ...filteredChoices,
          new inquirer.Separator(),
          // { name: '退出', value: 'quit' }
        ],
        pageSize: 10,
        validate: input => {
          if (input.length === 0) {
            return '请至少选择一个API';
          }
          return true;
        },
        onKeypress: (e, key) => {
          if (key.name === 'a') {
            const list = key.list;
            const items = list.choices.filter(item => !item.disabled && !item.separator && item.value !== 'quit' && item.value !== 'custom');
            items.forEach(item => {
              if (!item.checked) {
                list.toggleChoice(item);
              }
            });
          }
        }
      }
    ]);
    
    // 处理自定义API选项
    if (answers.apiIndexes.includes('custom')) {
      // 移除custom选项
      answers.apiIndexes = answers.apiIndexes.filter(item => item !== 'custom');
      
      // 收集自定义API信息
      await this.createCustomApi();
      
      // 重新显示主菜单
      return this.showMainMenu();
    }

    // if (answers.apiIndexes.includes('quit')) {
    //   console.log(
    //     success('\n✔ 已退出代码生成器') +
    //     '\n  感谢使用，再见！'
    //   );
    //   process.exit(0);
    // }


    console.log(
      success('\n✔ 已选择API') + 
      `\n  ${answers.apiIndexes.map(index => this.generator.apis[index].path).join('\n  ')}`);
      
    


    // 如果选择了多个API，进入批量生成模式
    if (answers.apiIndexes.length > 1) {
      // 过滤掉'quit'选项
      const validApiIndexes = answers.apiIndexes.filter(index => index !== 'quit' && index !== 'custom');
      if (validApiIndexes.length === 0) {
        console.log(
          warning('\n⚠ 没有选择任何有效的API')
        );
        return;
      }
      const typeChoices = [
        ...Object.keys(this.generator.config.templates).map(key => ({
          name: `生成${key}`,
          value: key
        })),
        { name: '返回主菜单', value: 'back' }
      ];

      const { types } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'types',
        message: info('请选择要批量生成的组件类型:'),
        choices: typeChoices,
        validate: input => {
          if (input.length === 0) {
            return '请至少选择一个组件类型';
          }
          return true;
        }
      }]);

      if (types.includes('back')) {
        return;
      }

      try {
        const apis = answers.apiIndexes.map(index => this.generator.apis[index]);
        const results = await this.generator.batchGenerate(apis, types);
        
        console.log(
          success('\n✔ 批量生成完成!') +
          '\n  成功: ' + success(results.filter(r => r.success).length) +
          '  失败: ' + error(results.filter(r => !r.success).length)
        );

        // 显示详细结果
        results.forEach(result => {
          if (result.success) {
            console.log(
              success('  ✔ ') +
              `${result.type}: ${info(result.outputPath)}`
            );
          } else {
            console.log(
              error('  ✖ ') +
              `${result.type}: ${info(result.outputPath)}\n` +
              `     错误: ${result.error}`
            );
          }
        });
      } catch (e) {
        console.log(
          error('\n✖ 批量生成失败') +
          `\n  错误信息: ${e.message}`
        );
      }
    } else {
      // 单个API的情况，保持原有逻辑
      for (const apiIndex of answers.apiIndexes) {
        await this.showGenerateMenu(this.generator.apis[apiIndex]);
      }
    }
    
    await this.showMainMenu();
  }

  /**
   * 创建自定义API
   * 收集用户输入的API信息并创建自定义API
   */
  static async createCustomApi() {
    console.log(title('\n创建自定义API'));
    
    // 收集API基本信息
    const apiInfo = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: info('API名称:'),
        validate: input => input.trim() ? true : 'API名称不能为空'
      },
      {
        type: 'input',
        name: 'path',
        message: info('API路径 (以/开头):'),
        validate: input => {
          if (!input.trim()) return 'API路径不能为空';
          if (!input.startsWith('/')) return 'API路径必须以/开头';
          return true;
        }
      },
      {
        type: 'checkbox',
        name: 'methods',
        message: info('HTTP方法:'),
        choices: ['get', 'post', 'put', 'delete', 'patch'],
        default: ['get'],
        validate: input => input.length ? true : '请至少选择一种HTTP方法'
      },
      {
        type: 'input',
        name: 'tags',
        message: info('标签 (可选):'),
        default: ''
      }
    ]);
    
    // 收集参数信息
    const parameters = [];
    let addMoreParams = true;
    
    console.log(info('\n添加API参数 (请求参数和响应字段):'));
    
    while (addMoreParams) {
      const paramInfo = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: info('参数名称:'),
          validate: input => input.trim() ? true : '参数名称不能为空'
        },
        {
          type: 'list',
          name: 'type',
          message: info('参数类型:'),
          choices: ['string', 'number', 'boolean', 'object', 'array'],
          default: 'string'
        },
        {
          type: 'input',
          name: 'description',
          message: info('参数描述 (可选):'),
          default: ''
        },
        {
          type: 'confirm',
          name: 'required',
          message: info('是否必填:'),
          default: false
        }
      ]);
      
      parameters.push(paramInfo);
      
      const { addMore } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addMore',
          message: info('是否继续添加参数?'),
          default: false
        }
      ]);
      
      addMoreParams = addMore;
    }
    
    // 创建自定义API
    const customApi = {
      ...apiInfo,
      parameters
    };
    
    try {
      const spinner = ora('正在创建自定义API...').start();
      const api = this.generator.createCustomApi(customApi);
      spinner.succeed(success('✔ 自定义API创建成功!'));
      console.log(info(`API名称: ${api.name}`));
      console.log(info(`API路径: ${api.path}`));
      console.log(info(`参数数量: ${parameters.length}`));
      
      // 询问是否立即生成代码
      const { generateNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'generateNow',
          message: info('是否立即为此API生成代码?'),
          default: true
        }
      ]);
      
      if (generateNow) {
        await this.showGenerateMenu(api);
      }
      
      return api;
    } catch (e) {
      console.log(error(`\n✖ 创建自定义API失败: ${e.message}`));
      return null;
    }
  }
  
  static async showGenerateMenu(api) {
    console.log(title(`\n选择的API: ${api.path}`));

    const typeChoices = [
      ...Object.keys(this.generator.config.templates).map(key => ({
        name: `生成${key}`,
        value: key
      })),
      { name: '返回主菜单', value: 'back' }
    ];

    const typeAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: info('选择生成类型:'),
        choices: typeChoices,
        pageSize: 5
      }
    ]);

    if (typeAnswer.type === 'back') {
      return;
    }

    const basePath = `${this.generator.config.outputDir}${api.path}`;
    const filterModal = basePath.split('/');
    filterModal.pop();
    const defaultPath = (typeAnswer.type === 'filter' || typeAnswer.type === 'modal')
    ? `${filterModal.join('/')}/components/${api.apiPath}_${typeAnswer.type}.vue`
    : `${basePath}.vue`;

    let finalPath = defaultPath;
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: info(`确认生成路径: ${defaultPath}`),
        choices: [
          { name: '确认', value: 'confirm' },
          { name: '编辑路径', value: 'edit' }
        ],
        default: 'confirm'
      }
    ]);

    if (action === 'edit') {
      const pathAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'path',
          message: info('请输入新的路径:'),
          default: defaultPath,
          filter: (input) => input.trim() || defaultPath,
          validate: input => {
            if (!input.trim()) {
              return '路径不能为空';
            }
            return true;
          }
        }
      ]);
      finalPath = pathAnswer.path;
    }

    // 显示生成过程中的加载动画
    const spinner = ora({
      text: info(`正在生成 ${typeAnswer.type} 文件...`),
      spinner: 'dots'
    }).start();

    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟耗时
      const outputPath = await this.generator.generate(api, typeAnswer.type, finalPath);
      
      if (outputPath === false) {
        spinner.info('已取消文件生成');
      } else {
        spinner.succeed(
          success('✔ 生成成功!') +
          `\n  文件路径: ${info(outputPath)}` +
          `\n  生成类型: ${info(typeAnswer.type)}`
        );
      }
    } catch (e) {
      spinner.fail(
        error('✖ 生成失败') +
        `\n  错误信息: ${e.message}` +
        `\n  请检查模板文件和权限`
      );
    }

    const { continueWithApi } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWithApi',
        message: info('继续操作当前API?'),
        default: true
      }
    ]);

    if (continueWithApi) {
      await this.showGenerateMenu(api);
    }
  }
}

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
module.exports = UI;