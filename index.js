#!/usr/bin/env node

const Generator = require('./src/generator');
const UI = require('./src/ui');
const chalk = require('chalk');

async function main() {
  try {
    const configPath = process.cwd() + '/codegen.config.js';
    const config = require(configPath);
    const generator = new Generator(config);
    await generator.init();
    await UI.start(generator);
  } catch (e) {
    console.log(
      chalk.red('✖ 初始化失败') +
      `\n  错误信息: ${e.message}` +
      '\n  请检查配置文件和网络连接'
    );
    process.exit(1);
  }
}

main();