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
            const items = list.choices.filter(item => !item.disabled && !item.separator && item.value !== 'quit');
            items.forEach(item => {
              if (!item.checked) {
                list.toggleChoice(item);
              }
            });
          }
        }
      }
    ]);

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
      const validApiIndexes = answers.apiIndexes.filter(index => index !== 'quit');
      if (validApiIndexes.length === 0) {
        console.log(
          warning('\n⚠ 没有选择任何有效的API')
        );
        return;
      }
      const typeChoices = [
        { name: '生成列表', value: 'list' },
        { name: '生成表单', value: 'form' },
        { name: '生成筛选', value: 'filter' },
        { name: '生成弹窗', value: 'modal' }
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

  static async showGenerateMenu(api) {
    console.log(title(`\n选择的API: ${api.path}`));

    const typeChoices = [
      { name: '生成列表', value: 'list' },
      { name: '生成表单', value: 'form' },
      { name: '生成筛选', value: 'filter' },
      { name: '生成弹窗', value: 'modal' },
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
    const defaultPath = (typeAnswer.type === 'filter' || typeAnswer.type === 'modal')
      ? `${basePath}/components/${typeAnswer.type}.vue`
      : `${basePath}.vue`;

    const pathAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'path',
        message: info('请确认或修改生成路径:'),
        default: defaultPath,
        validate: input => {
          if (!input.trim()) {
            return '路径不能为空';
          }
          return true;
        }
      }
    ]);

    const spinner = ora({
      text: info(`正在生成 ${typeAnswer.type} 文件...`),
      spinner: 'dots'
    }).start();

    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟耗时
      const outputPath = await this.generator.generate(api, typeAnswer.type, pathAnswer.path);
      
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