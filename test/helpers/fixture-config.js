'use strict';
/*
 * 手寫的最小遊戲設定：結構與官方 game-config.json 相同（契約測試會確認官方設定真的有這些欄位），
 * 數字另外挑成容易心算。單元測試不依賴官方的實際數值，所以官方調整平衡不會讓單元測試失敗。
 */
function makeCfg() {
  return {
    meta: { configVersion: 'fixture', saveFormatVersion: 1 },
    rules: { moistMaxLevel: 4, waterPerTap: 1, animalStackMax: 0 },
    levels: [
      { level: 1, unlocks: ['wheat', 'pasture', 'egg_hen'] },
      { level: 2, unlocks: ['corn', 'corn_cake_machine'] },
      { level: 3, unlocks: ['tomato', 'orange', 'care', 'compost_bin'] },
      { level: 5, unlocks: ['potato'] },
    ],
    crops: {
      wheat: { name: '小麥', seedCost: 5, growSeconds: 120, yield: 1, sellPrice: 15 },
      corn: { name: '玉米', seedCost: 30, growSeconds: 1800, yield: 1, sellPrice: 105 },
      tomato: { name: '番茄', seedCost: 8, growSeconds: 300, yield: 2, sellPrice: 20 },
      potato: { name: '馬鈴薯', seedCost: 12, growSeconds: 600, yield: 3, sellPrice: 30 },
      pasture: { name: '牧草', seedCost: 2, growSeconds: 60, yield: 5, sellPrice: 1 },
    },
    trees: {
      orange: { name: '柳丁', firstFruitSeconds: 36000, fruitIntervalSeconds: 10800 },
    },
    animals: {
      egg_hen: {
        name: '蛋雞', type: 'producer', growStages: 2, stageSeconds: 1800, cycleSeconds: 1800,
        stageFeedQty: 1, cycleFeedQty: 1, feedItem: 'corn_cake', productItem: 'egg', lifespanCycles: 40,
      },
      wool_sheep: {
        name: '毛羊', type: 'producer', growStages: 2, stageSeconds: 7200, cycleSeconds: 7200,
        stageFeedQty: 5, cycleFeedQty: 5, feedItem: 'pasture', productItem: 'wool', lifespanCycles: 30,
      },
      broiler: {
        name: '肉雞', type: 'meat', growStages: 3, stageSeconds: 3600,
        stageFeedQty: 2, feedItem: 'corn_cake', productItem: 'chicken_meat',
      },
    },
    fish: {
      tilapia: { name: '吳郭魚', stages: 2, stageSeconds: 10800, stageFeedQtyPerTile: 2, feedItem: 'fish_feed' },
    },
    fishPool: { sizeBonus: [{ minTiles: 1, bonus: 0 }, { minTiles: 4, bonus: 0.1 }, { minTiles: 9, bonus: 0.2 }] },
    machines: {
      compost_bin: { name: '堆肥桶', input: { poop: 4, weed: 2 }, output: { organic_fert: 2 }, seconds: 3600 },
      fish_feed_machine: { name: '魚飼料機', input: { wheat: 1 }, output: { fish_feed: 8 }, seconds: 900 },
      corn_cake_machine: { name: '玉米餅機', input: { corn: 1 }, output: { corn_cake: 20 }, seconds: 600 },
    },
    machineUpgrade: {
      maxLevel: 5, batchesPerLevel: 1,
      appliesTo: ['fish_feed_machine', 'corn_cake_machine', 'compost_bin'],
    },
    devices: {
      beehive: { name: '蜂箱', kind: 'hive' },
      well: { name: '水井', kind: 'well' },
    },
    feedShop: { pasture: 4, corn_cake: 6, fish_feed: 5 },
    items: {
      wheat: { name: '小麥', category: 'crop', sellPrice: 15 },
      org_wheat: { name: '有機小麥', category: 'crop', sellPrice: 21 },
      corn: { name: '玉米', category: 'crop', sellPrice: 105 },
      org_corn: { name: '有機玉米', category: 'crop', sellPrice: 147 },
      tomato: { name: '番茄', category: 'crop', sellPrice: 20 },
      potato: { name: '馬鈴薯', category: 'crop', sellPrice: 30 },
      org_potato: { name: '有機馬鈴薯', category: 'crop', sellPrice: 42 },
      pasture: { name: '牧草', category: 'feed', sellPrice: 1 },
      corn_cake: { name: '玉米餅', category: 'feed', sellPrice: 2 },
      fish_feed: { name: '魚飼料', category: 'feed', sellPrice: 2 },
      egg: { name: '雞蛋', category: 'product', sellPrice: 30 },
      wool: { name: '羊毛', category: 'product', sellPrice: 120 },
      chicken_meat: { name: '雞肉', category: 'meat', sellPrice: 220 },
      poop: { name: '糞便', category: 'material', sellPrice: 0 },
      weed: { name: '雜草', category: 'material', sellPrice: 1 },
      organic_fert: { name: '有機肥', category: 'material', sellPrice: 5 },
      orange: { name: '柳丁', category: 'fruit', sellPrice: 40 },
      tilapia: { name: '吳郭魚', category: 'fish', sellPrice: 25 },
      honey_wild: { name: '野蜂蜜', category: 'honey', sellPrice: 20 },
      honey_rose: { name: '玫瑰蜜', category: 'honey', sellPrice: 40 },
    },
  };
}

module.exports = { makeCfg };
