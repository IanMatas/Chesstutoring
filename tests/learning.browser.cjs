// Run against the local Python server: node tests/learning.browser.cjs
// Uses the environment's installed Playwright and Chromium; no app dependencies.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox'],...(process.env.https_proxy||process.env.HTTPS_PROXY?{proxy:{server:process.env.https_proxy||process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Preserve TLS verification through the injected platform CA in Node.
 await page.route('https://**/*',async route=>{const response=await route.fetch();await route.fulfill({response});});
 await page.addInitScript(()=>{Math.random=()=>0;});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.app?.cachedEval && !document.getElementById('loadingOverlay').classList.contains('active'));
 await page.screenshot({path:'/tmp/chess-free-play.png',fullPage:true});
 assert.equal(await page.locator('#modeTabs button').count(),3);
 assert.equal(await page.locator('#hintBtn').isVisible(),false);
 assert.equal(await page.locator('#puzzleDialog').isVisible(),false);
 // Validate every authored line, including black variants and mate goals.
 const catalog=await page.evaluate(()=>ChessLearning.CATALOG.map(p=>{const g=new Chess(p.fen);let valid=true;for(let i=0;i<p.line.length;i++){const move=g.move(ChessLearning.moveObject(p.line[i]));if(!move){valid=false;break;}if(p.skill==='forks'&&i===0&&!g.in_check())valid=false;if(p.skill==='forks'&&i===2&&move.captured!=='q')valid=false;if(p.skill==='safety'&&(!move.captured||g.moves({verbose:true}).some(r=>r.to===move.to&&r.captured)))valid=false;}return{id:p.id,valid,mate:p.skill!=='mate'||g.in_checkmate()};}));
 assert.equal(catalog.length,18);assert(catalog.every(p=>p.valid&&p.mate));
 // Real persistence and schedule semantics, including same-day repetitions and failures.
 const storeChecks=await page.evaluate(()=>{
  const {LearningStore,CATALOG,DAY}=ChessLearning;const memory=new Map();const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  const s=new LearningStore(storage),p=CATALOG[0],at=100*DAY;
  s.record(p,{solved:true,hints:0,errors:0,source:'practice'},at);
  const first=s.data.results[p.id].due;
  s.record(p,{solved:true,hints:0,errors:0,source:'practice'},at+1000);
  const same=s.data.results[p.id].due;
  s.record(p,{solved:true,hints:0,errors:0,source:'practice'},at+DAY+2000);
  const later=s.data.results[p.id].due;
  const reviews=s.stats('safety').reviews;
  const restored=new LearningStore(storage);
  s.record(p,{solved:true,hints:1,errors:0,source:'practice'},at+2*DAY);
  return{first,same,later,reviews,restored:restored.data.attempts.length,guided:s.data.attempts.at(-1).clean,expectedLater:at+4*DAY+2000};
 });
 assert.equal(storeChecks.first,storeChecks.same);assert.equal(storeChecks.later,storeChecks.expectedLater);assert.equal(storeChecks.reviews,1);assert.equal(storeChecks.restored,3);assert.equal(storeChecks.guided,false);
 await page.click('#modePuzzles');
 await page.click('[data-puzzle-filter="all"]');
 assert.equal(await page.locator('.puzzle-card').count(),18);
 await page.screenshot({path:'/tmp/chess-puzzles.png',fullPage:true});
 await page.click('[data-puzzle="royal-fork"]');
 const originalFen=await page.evaluate(()=>app.game.fen());
 await page.locator('#puzzleBoard [data-square="e5"]').click();await page.locator('#puzzleBoard [data-square="f7"]').click();
 assert.match(await page.locator('#puzzleFeedback').innerText(),/finish the idea/);
 await page.locator('#puzzleBoard [data-square="f7"]').click();await page.locator('#puzzleBoard [data-square="d8"]').click();
 assert.equal(await page.locator('#puzzleStep').innerText(),'SOLVED WITHOUT HELP');
 assert.equal(await page.evaluate(()=>app.game.fen()),originalFen);
 await page.click('#closePuzzle');
 // Wrong move, progressively stronger hints, and reveal must never count as independent.
 await page.click('[data-puzzle="back-rank"]');
 await page.locator('#puzzleBoard [data-square="e1"]').click();await page.locator('#puzzleBoard [data-square="e2"]').click();
 assert.match(await page.locator('#puzzleFeedback').innerText(),/not checkmate/);
 await page.click('#puzzleHint');await page.click('#puzzleHint');await page.click('#puzzleReveal');
 assert.equal(await page.evaluate(()=>learning.store.data.attempts.at(-1).clean),false);
 await page.click('#closePuzzle');
 // An alternative mating move must also be accepted.
 await page.click('[data-puzzle="queen-support"]');
 await page.locator('#puzzleBoard [data-square="g6"]').click();await page.locator('#puzzleBoard [data-square="h6"]').click();
 assert.equal(await page.locator('#puzzleStep').innerText(),'SOLVED WITHOUT HELP');await page.click('#closePuzzle');
 // Black orientation and solution.
 await page.click('[data-puzzle="loose-queen-black"]');
 assert.equal(await page.locator('#puzzleBoard button').first().getAttribute('data-square'),'h1');
 await page.locator('#puzzleBoard [data-square="d8"]').click();await page.locator('#puzzleBoard [data-square="d4"]').click();
 assert.equal(await page.locator('#puzzleStep').innerText(),'SOLVED WITHOUT HELP');await page.click('#closePuzzle');
 const saved=await page.evaluate(()=>learning.store.data.attempts.length);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.app?.cachedEval);
 assert.equal(await page.evaluate(()=>learning.store.data.attempts.length),saved);
 // Free Play never interrupts. Reach the first quiz interval with genuine legal moves.
 for(let i=0;i<4;i++){
  const u=await page.evaluate(()=>app.cachedEval.bestMove);
  await page.locator(`#chessboard [data-square="${u.slice(0,2)}"]`).click();await page.locator(`#chessboard [data-square="${u.slice(2,4)}"]`).click();
  await page.waitForFunction(n=>app.game.history().length>=n && !app.thinking,(i+1)*2,{timeout:30000});
  assert.equal(await page.locator('#puzzleDialog').isVisible(),false);
 }
 const beforeQuiz=await page.evaluate(()=>({fen:app.game.fen(),history:app.game.history()}));
 await page.click('#modeCoach');
 await page.waitForFunction(()=>learning.session?.source==='quiz'&&!learning.session.busy);
 await page.screenshot({path:'/tmp/chess-surprise-quiz.png',fullPage:true});
 const best=await page.evaluate(()=>learning.session.puzzle.line[0]);
 await page.locator(`#puzzleBoard [data-square="${best.slice(0,2)}"]`).click();await page.locator(`#puzzleBoard [data-square="${best.slice(2,4)}"]`).click();
 await page.waitForFunction(()=>learning.session?.done);
 await page.click('#puzzleNext');
 assert.deepEqual(await page.evaluate(()=>({fen:app.game.fen(),history:app.game.history()})),beforeQuiz);
 assert.equal(await page.locator('#puzzleDialog').isVisible(),false);
 // Mistakes enter practice while the game is ongoing; deduplicate repeated positions.
 const captured=await page.evaluate(()=>{const p=ChessLearning.CATALOG[0];const m={cpLoss:300,bestMove:p.line[0],fenBefore:p.fen,san:'Kh2'};const before=learning.store.data.moments.length;learning.capture(m);learning.capture(m);return learning.store.data.moments.length-before;});
 assert.equal(captured,1);
 await page.click('#modePuzzles');await page.click('[data-puzzle-filter="mistakes"]');assert((await page.locator('.puzzle-card').count())>=2);
 // Personal positions are actually graded by the engine, including a poor alternative.
 const personalId=await page.evaluate(()=>learning.store.data.moments.find(p=>p.title==='Rethink move Kh2').id);
 await page.locator(`[data-puzzle="${personalId}"]`).click();
 await page.waitForFunction(()=>learning.session&&!learning.session.busy);
 await page.locator('#puzzleBoard [data-square="g1"]').click();await page.locator('#puzzleBoard [data-square="h2"]').click();
 await page.waitForFunction(()=>learning.session.errors===1&&!learning.session.busy);
 assert.match(await page.locator('#puzzleFeedback').innerText(),/opponent can play/);
 const better=await page.evaluate(()=>learning.session.puzzle.line[0]);
 await page.locator(`#puzzleBoard [data-square="${better.slice(0,2)}"]`).click();await page.locator(`#puzzleBoard [data-square="${better.slice(2,4)}"]`).click();
 await page.waitForFunction(()=>learning.session.done);
 assert.equal(await page.evaluate(()=>learning.store.data.attempts.at(-1).clean),false);
 await page.click('#closePuzzle');
 // A skipped surprise check changes neither the game nor the progress score.
 await page.evaluate(()=>{learning.nextQuiz=app.moveData.filter(m=>m.isPlayer).length;});
 const beforeSkip=await page.evaluate(()=>({fen:app.game.fen(),attempts:learning.store.data.attempts.length}));
 await page.click('#modeCoach');await page.waitForFunction(()=>learning.session?.source==='quiz'&&!learning.session.busy);
 await page.click('#closePuzzle');
 assert.deepEqual(await page.evaluate(()=>({fen:app.game.fen(),attempts:learning.store.data.attempts.length})),beforeSkip);
 await page.click('#modePlay');await page.click('#modeCoach');assert.equal(await page.locator('#puzzleDialog').isVisible(),false);
 // Engine initialization failure is recoverable and doesn't create a failed learner result.
 await page.evaluate(async()=>{
  const original=learning.evaluate;learning.evaluate=async()=>{throw Error('Simulated unavailable engine');};
  await learning.open(learning.store.data.moments[0]);learning.evaluate=original;
 });
 assert.match(await page.locator('#puzzleFeedback').innerText(),/unavailable/);
 assert.equal(await page.locator('#puzzleHint').isDisabled(),true);
 await page.click('#closePuzzle');
 assert.equal(await page.evaluate(()=>learning.store.data.attempts.length),beforeSkip.attempts);
 // New-game reset and playing Black do not leave the move lock stuck.
 await page.click('#newGameBtn');await page.click('[data-color="black"]');await page.click('#startGameBtn');
 await page.waitForFunction(()=>app.playerColor==='b'&&!app.thinking&&app.game.history().length===1);
 assert.equal(await page.evaluate(()=>learning.quizCount),0);
 await page.click('#modePuzzles');
 // Responsive layout + modal interaction.
 await page.setViewportSize({width:390,height:844});await page.click('[data-puzzle-filter="all"]');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/chess-puzzles-mobile.png',fullPage:true});
 await page.click('[data-puzzle="queen-support"]');
 assert.equal(await page.evaluate(()=>document.getElementById('puzzleDialog').scrollWidth<=document.getElementById('puzzleDialog').clientWidth),true);
 await page.screenshot({path:'/tmp/chess-puzzle-mobile.png',fullPage:false});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#puzzleDialog').isVisible(),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: 18 valid puzzles; scheduling/persistence; multi-move and black puzzles; hints/reveal; four uninterrupted game turns; live quiz isolation; personal engine grading; skip/failure recovery; Black new game; mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
