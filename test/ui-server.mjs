// Local UI verification only: deterministic AI fixture, no external API calls.
import express from '../api/node_modules/express/index.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../api/src/server.js');
const app = createApp({ RECIPE_STORE:'memory', RECIPE_ADMIN_TOKEN:'local-test-only' }, {
  analyzeImages: async () => ({title:"画像のツナ丼（テスト）",sourceServings:2,ingredients:[{name:"ご飯",amount:"300g"},{name:"ツナ",amount:null}],steps:["ご飯をよそう","ツナをのせる"],warnings:["ツナの分量を元画像で確認してください。"]}),
  importRecipe: async () => ({ title:'ツナ丼（テスト）', videoUrl:'https://www.youtube.com/watch?v=abcdefghijk', source:'YouTube', sourceServings:2, ingredients:[{name:'ご飯',amount:'300g',category:'主食'},{name:'ツナ',amount:'2缶',category:'缶詰'}], steps:['ご飯をよそう','ツナをのせる'] })
});
const root = fileURLToPath(new URL('../',import.meta.url));
app.get('/',async(req,res)=>res.type('html').send((await readFile(`${root}/index.html`,'utf8')).replace('https://matagochi-api-292190013809.us-central1.run.app','http://127.0.0.1:8001')));
app.use(express.static(root));
app.listen(8001,'127.0.0.1',()=>console.log('Test preview: http://127.0.0.1:8001'));
