const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Generator = require('./generator');

const success = chalk.green;
const error = chalk.red;
const info = chalk.cyan;
const warning = chalk.yellow;
const title = chalk.bold.white;

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

    const answers = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'apiIndex',
        message: info('请选择API (输入过滤，支持上下键选择):'),
        source: async (_, input) => {
          input = input || '';
          return choices.filter(choice => 
            choice.name.toLowerCase().includes(input.toLowerCase())
          );
        },
        pageSize: 10,
        emptyText: error('没有匹配的API')
      }
    ]);

    if (answers.apiIndex === 'quit') {
      console.log(success('已退出代码生成器'));
      return;
    }

    await this.showGenerateMenu(this.generator.apis[answers.apiIndex]);
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
      const outputPath = this.generator.generate(api, typeAnswer.type, pathAnswer.path);
      
      spinner.succeed(
        success('✔ 生成成功!') +
        `\n  文件路径: ${info(outputPath)}` +
        `\n  生成类型: ${info(typeAnswer.type)}`
      );
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