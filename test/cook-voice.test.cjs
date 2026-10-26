const test = require("node:test");
const assert = require("node:assert/strict");
const CookMode = require("../cook-mode.js");

test("CookMode.parseVoice: recognizes navigation, timer, material, and control keywords", () => {
  // 次へ
  assert.deepEqual(CookMode.parseVoice("次"), { act: "next", label: "次へ" });
  assert.deepEqual(CookMode.parseVoice("次へ"), { act: "next", label: "次へ" });
  assert.deepEqual(CookMode.parseVoice("つぎへ"), { act: "next", label: "次へ" });
  assert.deepEqual(CookMode.parseVoice("進む"), { act: "next", label: "次へ" });
  assert.deepEqual(CookMode.parseVoice("できた"), { act: "next", label: "次へ" });
  assert.deepEqual(CookMode.parseVoice("完了"), { act: "next", label: "次へ" });

  // 前へ
  assert.deepEqual(CookMode.parseVoice("前"), { act: "prev", label: "前へ" });
  assert.deepEqual(CookMode.parseVoice("前へ"), { act: "prev", label: "前へ" });
  assert.deepEqual(CookMode.parseVoice("戻る"), { act: "prev", label: "前へ" });
  assert.deepEqual(CookMode.parseVoice("もどる"), { act: "prev", label: "前へ" });
  assert.deepEqual(CookMode.parseVoice("戻して"), { act: "prev", label: "前へ" });
  assert.deepEqual(CookMode.parseVoice("ひとつ前"), { act: "prev", label: "前へ" });

  // タイマー
  assert.deepEqual(CookMode.parseVoice("タイマー"), { act: "timer", label: "タイマー" });
  assert.deepEqual(CookMode.parseVoice("たいまー"), { act: "timer", label: "タイマー" });
  assert.deepEqual(CookMode.parseVoice("スタート"), { act: "timer", label: "タイマー" });
  assert.deepEqual(CookMode.parseVoice("計って"), { act: "timer", label: "タイマー" });
  assert.deepEqual(CookMode.parseVoice("はかって"), { act: "timer", label: "タイマー" });

  // ストップ
  assert.deepEqual(CookMode.parseVoice("ストップ"), { act: "stop", label: "ストップ" });
  assert.deepEqual(CookMode.parseVoice("止めて"), { act: "stop", label: "ストップ" });
  assert.deepEqual(CookMode.parseVoice("静かに"), { act: "stop", label: "ストップ" });

  // 材料
  assert.deepEqual(CookMode.parseVoice("材料"), { act: "toggle-uses", label: "材料" });
  assert.deepEqual(CookMode.parseVoice("ざいりょう"), { act: "toggle-uses", label: "材料" });
  assert.deepEqual(CookMode.parseVoice("分量"), { act: "toggle-uses", label: "材料" });

  // もう一回
  assert.deepEqual(CookMode.parseVoice("もう一回"), { act: "repeat", label: "もう一回" });
  assert.deepEqual(CookMode.parseVoice("リピート"), { act: "repeat", label: "もう一回" });
  assert.deepEqual(CookMode.parseVoice("最初から"), { act: "repeat", label: "もう一回" });

  // 終了
  assert.deepEqual(CookMode.parseVoice("終了"), { act: "close", label: "終了" });
  assert.deepEqual(CookMode.parseVoice("閉じる"), { act: "close", label: "終了" });
  assert.deepEqual(CookMode.parseVoice("終わり"), { act: "close", label: "終了" });
  assert.deepEqual(CookMode.parseVoice("料理モード終了"), { act: "close", label: "終了" });

  // 無関係な言葉
  assert.equal(CookMode.parseVoice("こんばんは"), null);
  assert.equal(CookMode.parseVoice("お醤油"), null);
  assert.equal(CookMode.parseVoice(""), null);
});

test("CookMode._hear: drives cooking mode steps, timer, materials, and exit", () => {
  const domElements = new Map();
  globalThis.document = {
    getElementById: (id) => domElements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        setAttribute: () => {},
        querySelector: (sel) => {
          if (sel.includes("cm-count")) return { textContent: "" };
          if (sel.includes("cm-dots")) return { innerHTML: "" };
          if (sel.includes("cm-body")) return { innerHTML: "" };
          if (sel.includes("prev")) return { disabled: false };
          if (sel.includes("next")) return { innerHTML: "" };
          return null;
        },
        querySelectorAll: () => [],
        append: () => {},
        remove: () => {
          if (el.id) domElements.delete(el.id);
        },
      };
      return el;
    },
    body: {
      classList: { add: () => {}, remove: () => {} },
      append: (el) => {
        if (el.id) domElements.set(el.id, el);
      },
    },
  };

  const recipe = {
    title: "鶏の照り焼き",
    steps: ["皮目を下にして中火で3分焼く", "タレを入れて2分煮詰める", "器に盛る"],
    times: [180, 120, null],
    ingredients: [{ name: "鶏もも肉", amount: "300g" }],
  };

  CookMode.setRecipe(recipe);
  CookMode.openMode();

  assert.equal(CookMode._mode().at, 0);

  // Hear "次へ" -> advances to step 1
  CookMode._hear("次へ");
  assert.equal(CookMode._mode().at, 1);

  // Hear "前へ" -> goes back to step 0
  CookMode._hear("戻る");
  assert.equal(CookMode._mode().at, 0);

  // Hear "材料" -> toggles all materials
  assert.equal(CookMode._mode().showAll, false);
  CookMode._hear("材料");
  assert.equal(CookMode._mode().showAll, true);
  CookMode._hear("材料");
  assert.equal(CookMode._mode().showAll, false);

  // Hear "タイマー" -> starts timer for 3 min (180s)
  CookMode._hear("タイマー");
  let timers = CookMode._timers();
  assert.ok(timers.length > 0);
  const activeTimer = timers[timers.length - 1];
  assert.equal(activeTimer.total, 180);

  // Hear "ストップ" -> pauses the active timer
  CookMode._hear("ストップ");
  assert.notEqual(activeTimer.left, null);

  // When timer is ringing (done), hear "ストップ" clears it
  activeTimer.done = true;
  CookMode._hear("止めて");
  assert.ok(!CookMode._timers().some((t) => t.id === activeTimer.id));

  // Hear "終了" -> closes cook mode
  CookMode._hear("終了");
  assert.equal(CookMode._mode().at, -1);
  CookMode._clearTimers();
});

test("review: Android timer notification uses service worker and handles rejection", async () => {
  const vm=require('node:vm'), fs=require('node:fs');
  let tick, time=100000, calls=0, reject=false;
  const bar={innerHTML:'',remove(){}};
  class D extends Date { static now(){return time;} }
  class Notification { static permission='granted'; constructor(){throw new Error('Android constructor must not be called');} }
  const ctx=vm.createContext({Date:D,console,Notification,setInterval(fn){tick=fn;return 1;},clearInterval(){},
    navigator:{serviceWorker:{async getRegistration(){return {async showNotification(title,opts){calls++;assert.match(title,/タイマー/);assert.match(opts.tag,/cook-timer/);if(reject)throw new Error('unavailable');}}}}},
    document:{hidden:true,getElementById:()=>bar},escapeHtml:String,escapeAttr:String});
  vm.runInContext(fs.readFileSync(require.resolve('../cook-mode.js'),'utf8'),ctx);
  vm.runInContext('CookMode.start(1,"煮る")',ctx);time+=2000;tick();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
  reject=true;time+=3000;tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);
});

test("review [P1]: voice recognition privacy text states Lipigochi does not send audio to its server, and sets processLocally when supported", () => {
  const fs = require("node:fs");
  const code = fs.readFileSync(require.resolve("../cook-mode.js"), "utf8");
  // Must not claim blanket on-device guarantee that cannot be enforced across all browsers
  assert.doesNotMatch(code, /音声はスマホの外に送りません/);
  // Must accurately inform user about Lipigochi server not collecting audio and using browser speech recognition
  assert.match(code, /リピごちのサーバーに音声は送信・保存されません/);
  assert.match(code, /ブラウザ標準の音声認識機能を使用します/);
  // Enables processLocally when supported by browser
  assert.match(code, /processLocally/);
});
