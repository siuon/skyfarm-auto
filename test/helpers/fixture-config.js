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
      // 長時間作物（施有機肥的門檻是 3 小時＝10800 秒；數值取自官方 2.68.1）
      taro: { name: '芋頭', seedCost: 125, growSeconds: 9000, yield: 1, sellPrice: 480 },
      rice: { name: '水稻', seedCost: 120, growSeconds: 10800, yield: 1, sellPrice: 510 },
      pumpkin: { name: '南瓜', seedCost: 140, growSeconds: 14400, yield: 1, sellPrice: 580 },
      coffee: { name: '咖啡', seedCost: 460, growSeconds: 36000, yield: 1, sellPrice: 1770 },
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
    feedShop: { pasture: 4, corn_cake: 6, fish_feed: 5, dog_food: 8, cat_food: 6 },
    // 機器人與耗材（結構同官方設定；數字與官方一致，方便對照）
    buildings: {
      robot_charger: { name: '機器人充電站', size: [1, 1], serves: 'feed' },
      drone_pad: { name: '無人機停機坪', size: [1, 1], serves: 'water' },
      heavy_charger: { name: '重型充電樁', size: [1, 1], serves: 'mine' },
    },
    robots: {
      kinds: {
        water: { name: '澆水無人機', base: 'drone_pad' },
        feed: { name: '餵食機器人', base: 'robot_charger' },
        poop: { name: '鏟屎官機器人', base: 'robot_charger' },
        lumber: { name: '伐木機器人', base: 'heavy_charger' },
        mine: { name: '採礦機器人', base: 'heavy_charger' },
        grade: { name: '整地機器人', base: 'heavy_charger' },
      },
    },
    terrain243: { robots: { kinds: { lumber: 'forest', mine: 'mine', grade: 'mound' } } },
    consumables: {
      bulkDiscount: [{ qty: 5, rate: 0.9 }, { qty: 10, rate: 0.8 }],
      parts: {
        wheel: { name: '輪子', for: ['feed', 'poop'], lifeWorkHours: 240, price: 50 },
        propeller: { name: '螺旋槳', for: ['water'], lifeWorkHours: 200, price: 60 },
        saw_chain: { name: '鋸鏈', for: ['lumber'], lifeWorkHours: 20, price: 150, manualSwap: true },
        drill: { name: '鑽頭', for: ['mine'], lifeWorkHours: 20, price: 250, manualSwap: true },
        blade: { name: '鏟刃', for: ['grade'], lifeWorkHours: 30, price: 100, manualSwap: true },
      },
    },
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
      // 耗材在官方倉庫的「耗材」分類，沒有售價（不能賣）
      dog_food: { name: '狗飼料', category: 'feed', sellPrice: 4, shopOnly: true },
      cat_food: { name: '貓飼料', category: 'feed', sellPrice: 3, shopOnly: true },
      part_wheel: { name: '輪子', category: 'part' },
      part_propeller: { name: '螺旋槳', category: 'part' },
      part_saw_chain: { name: '鋸鏈', category: 'part' },
      part_drill: { name: '鑽頭', category: 'part' },
      part_blade: { name: '鏟刃', category: 'part' },
      organic_fert: { name: '有機肥', category: 'material', sellPrice: 5 },
      orange: { name: '柳丁', category: 'fruit', sellPrice: 40 },
      tilapia: { name: '吳郭魚', category: 'fish', sellPrice: 25 },
      honey_wild: { name: '野蜂蜜', category: 'honey', sellPrice: 20 },
      honey_rose: { name: '玫瑰蜜', category: 'honey', sellPrice: 40 },
    },
  };
}

module.exports = { makeCfg };
