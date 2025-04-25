#!/usr/bin/env node

const Generator = require('./src/generator');
const UI = require('./src/ui');
const chalk = require('chalk');
const fs = require('fs');

async function createConfig() {
  const configPath = process.cwd() + '/codegen.config.js';
  const packagePath = process.cwd() + '/package.json';

  // 创建配置文件
  if (!fs.existsSync(configPath)) {
    const defaultConfig = `module.exports = {
  /**
   * 接口文档地址
   * @type {string}
   * @example @example URL@example URL_ADDRESS.jects/xxx/openapi.json
   * @description 请填写接口文档地址
   */
  openapiUrl: '',
  /**
   * 模板路径
   * @type {string}
   * @example @example PATH@example ./templates/list.art
   * @description 请填写模板路径
   * @default ./templates/list.art
   */
  templates: {
    list: '/templates/list.art',
    form: '/templates/form.art',
    filter: '/templates/filter.art',
    modal: '/templates/modal.art'
  },
  /**
   * 输出路径
   * @type {string}
   * @example @example PATH@example ./view
   * @description 请填写输出路径
   * @default @default PATH@default ./view
   */
  outputDir: './src/views',
  /**
   * 生成文件后缀
   * @type {string}
   * @example @example EMAIL@example .vue
   * @description 请填写生成文件后缀
   * @default @default EMAIL@default .vue
   */
  fileSuffix: {
    list: '.page.vue',
    form: '.page.vue',
    filter: '.vue',
    modal: '.vue'
  },
  /**
   * API 重构函数
   * @type {function}
   * @example @example FUNCTION@example(api) {
   * @description 请填写 API 重构函数
   * @default @default FUNCTION@default(api) {
   * @returns {object}
   */
    apiRefactor: (api) => {
      return api;
    }
}`;
    fs.writeFileSync(configPath, defaultConfig);
    console.log(chalk.green('✔ 已创建默认配置文件：codegen.config.js'));

    // 更新 package.json
    if (fs.existsSync(packagePath)) {
      const packageJson = require(packagePath);
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      packageJson.scripts.codegen = 'watch-code-generator';
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
      console.log(chalk.green('✔ 已添加 npm script: npm run codegen'));
    }
    return;
  }
  console.log(chalk.yellow('配置文件已存在，跳过创建'));
}

async function run() {
  const configPath = process.cwd() + '/codegen.config.js';
  if (!fs.existsSync(configPath)) {
    console.log(chalk.red('✖ 配置文件不存在，请先运行 init 命令创建配置文件'));
    process.exit(1);
  }
  const config = require(configPath);
  const generator = new Generator(config);
  await generator.init();
  await UI.start(generator);
}

async function main() {
  try {
    const command = process.argv[2];
    if (command === 'init') {
      await createConfig();
    } else {
      await run();
    }
  } catch (e) {
    console.log(
      chalk.red('✖ 执行失败') +
      `\n  错误信息: ${e.message}` +
      '\n  请检查配置文件和网络连接'
    );
    process.exit(1);
  }
}

main();