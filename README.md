# 🌿 修仙秘境 · 多人在线修仙 io 游戏

[![Render](https://img.shields.io/badge/Render-Deployed-brightgreen)](https://xian-io.onrender.com)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)

> 一款基于 Node.js + Socket.IO 的多人实时修仙对战游戏，支持账户系统、境界突破、法宝收集、无边界地图。

## 🎮 游戏简介

《修仙秘境》是一款多人在线修仙游戏。你扮演一名修士，在秘境中击杀妖兽、收集法宝、提升修为，突破境界。所有数据云端存储，换设备也能继续修仙！

**核心特色**：
- 多人实时同步，支持 50+ 玩家同服
- 账户系统（注册/登录），数据持久化
- 五大境界（炼气 → 筑基 → 金丹 → 元婴 → 化神）
- 多种妖兽（青风狼、赤焰虎、玄冰龟）AI 追击
- 法宝系统（飞剑、护盾、灵符）自动攻击
- 回血丹药，自动缓慢回血
- 无边界地图，摄像机跟随
- 修为条、血量条、境界显示

## 🚀 在线体验

- **游戏地址**：[https://xian-io.onrender.com](https://xian-io.onrender.com)  
- 欢迎注册体验，数据永久保存！

## 📸 游戏截图

> （可选：插入游戏截图，展示登录界面、游戏画面、妖兽战斗等）

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 实时通信 | Socket.IO |
| 前端渲染 | Canvas 原生 |
| 数据存储 | JSON 文件（可扩展为 MongoDB） |
| 账号安全 | bcrypt 密码哈希 + UUID 会话令牌 |
| 部署 | Render（或自托管） |

## 📦 安装与运行

### 环境要求
- Node.js 20.x 或更高
- npm 或 yarn

### 克隆项目
```bash
git clone https://github.com/lsq630/xian-io.git
cd xian-io
