const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage();p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 if (process.env.CHESS_TEST_ASSET_DIR) for(const [url,path] of [['https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js','/tmp/chesstutoring-chess.js'],['https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js','/tmp/chesstutoring-stockfish.js']])await p.route(url,r=>r.fulfill({contentType:'application/javascript',path:require('node:path').join(process.env.CHESS_TEST_ASSET_DIR,require('node:path').basename(path))}));
 await p.goto(process.env.CHESS_TEST_URL || 'http://127.0.0.1:8000/');await p.waitForFunction(()=>app.cachedEval);
 await p.locator('#chessboard [data-square=e2]').click();await p.locator('#chessboard [data-square=e4]').click();await p.waitForFunction(()=>app.moveData.length===2&&!app.thinking);
 assert.equal(await p.locator('.previous-move-lesson').count(),1);assert.ok(await p.locator('#coachContent > .live-engine-lines .engine-line').count()>0);
 await p.locator('[data-bot-tab=thinking]').click();await p.locator('.previous-move-lesson [data-tab=deep]').click();assert.ok(await p.locator('#botThinkingTab').isVisible());assert.ok(await p.locator('#coachRatingTab').isVisible());
 const fen=await p.evaluate(()=>app.game.fen());await p.locator('#coachContent > .live-engine-lines .engine-line').first().click();await p.locator('#varEndBtn').click();assert.equal(await p.evaluate(()=>app.game.fen()),fen);await p.locator('#varExitBtn').click();
 await p.locator('#prevMoveBtn').click();assert.equal(await p.locator('.previous-move-lesson').count(),0);await p.locator('#nextMoveBtn').click();assert.equal(await p.locator('.previous-move-lesson').count(),1);console.log('PASS persistent lesson, both tab groups, engine preview, move-history replay');
 await p.locator('#modePuzzles').click();await p.waitForFunction(()=>!puzzles.busy,null,{timeout:110000});assert.ok(await p.evaluate(()=>!!puzzles.puzzle),await p.locator('#puzzleStatus').innerText());
 const keys=new Set();
 async function solveAndCheck(level){
 const puzzle=await p.evaluate(()=>puzzles.puzzle);assert.equal(puzzle.difficulty,level);const key=puzzle.fen.split(' ').slice(0,4).join(' ');assert.ok(!keys.has(key));keys.add(key);
 assert.ok(await p.evaluate(()=>{const g=new Chess(puzzles.puzzle.fen);return puzzles.line.every(u=>!!g.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]}));}));
 let wrong=false;
 for(let i=0;i<4&&!wrong;i++){
  const candidate=await p.evaluate(i=>puzzles.game.moves({verbose:true}).filter(m=>m.from+m.to+(m.promotion||'')!==puzzles.line[puzzles.step])[i],i);
  if(!candidate)break;const before=await p.evaluate(()=>puzzles.game.fen());await p.evaluate(m=>puzzles.submit(m.from+m.to+(m.promotion||'')),candidate);wrong=await p.evaluate(()=>!puzzles.done)&&await p.evaluate(()=>puzzles.game.fen())===before;
  if(!wrong)await p.evaluate(()=>puzzles.restart());
 }
 assert.ok(wrong,'A losing legal move is rejected');
 await p.locator('#puzzleHint').click();assert.ok(await p.locator('.puzzle-square.selected').count());
 for(let i=0;i<5&&!await p.evaluate(()=>puzzles.done);i++){
   const move=await p.evaluate(()=>puzzles.line[puzzles.step]);if(move[4])await p.locator('#puzzlePromotion').selectOption(move[4]);
   await p.locator(`#puzzleBoard [data-square=${move.slice(0,2)}]`).click();await p.locator(`#puzzleBoard [data-square=${move.slice(2,4)}]`).click();await p.waitForFunction(()=>!puzzles.busy);
 }
 assert.ok((await p.locator('#puzzleStatus').innerText()).startsWith('Completed with assistance'));
 assert.equal(await p.locator('#puzzleSolution button').count(),puzzle.solution.length+1);
 const stats=await p.evaluate(()=>JSON.stringify(puzzles.stats));await p.locator('#puzzleSolution button').last().click();await p.locator('#puzzleRestart').click();await p.locator('#puzzleReveal').click();assert.equal(await p.evaluate(()=>JSON.stringify(puzzles.stats)),stats);
 console.log('PASS',level,'generation, legal line, wrong move, hint, board solve, solution review, no double counting',puzzle.fen);
 }
 await solveAndCheck('challenging');
 for(const level of ['expert','standard']){await p.locator('#puzzleDifficulty').selectOption(level);await p.locator('#puzzleNext').click();await p.waitForFunction(()=>!puzzles.busy,null,{timeout:110000});assert.equal(await p.evaluate(()=>puzzles.puzzle.difficulty),level,await p.locator('#puzzleStatus').innerText());await solveAndCheck(level);}
 await p.locator('#puzzleNext').click();await p.locator('#modePlay').click();await p.waitForFunction(()=>!puzzles.busy);assert.ok((await p.locator('#puzzleStatus').textContent()).includes('cancelled'));console.log('PASS background-generation cancellation');
 await p.locator('#modePuzzles').click();await p.setViewportSize({width:390,height:844});await p.evaluate(()=>window.scrollTo(0,0));
 const layout=await p.locator('#puzzleBoard').evaluate(el=>{const r=el.getBoundingClientRect();const last=el.lastChild.getBoundingClientRect();return {w:r.width,h:r.height,right:r.right,lastBottom:last.bottom,bottom:r.bottom}});assert.ok(Math.abs(layout.w-layout.h)<2);assert.ok(layout.right<=390);assert.ok(layout.lastBottom<=layout.bottom+1);assert.ok(!await p.locator('#puzzleCancel').isVisible());
console.log('PASS mobile board geometry and hidden cancel');
 await p.locator('#modePlay').click();
 await p.locator('#coachContent > .live-engine-lines .engine-line').first().click();await p.locator('#varNextBtn').click();
 const branchFen=await p.evaluate(()=>app.activeVariation.positions[app.varStepIndex]);
 await p.locator('#varPlayVsBotBtn').click();await p.waitForFunction(()=>!app.thinking);
 assert.equal(await p.evaluate(()=>app.game.fen()),branchFen);assert.equal(await p.evaluate(()=>app.posHistory.length),1);
 assert.equal(await p.evaluate(()=>app.playerColor),branchFen.split(' ')[1]);console.log('PASS practice game starts at selected line position');
 assert.deepEqual(errors,[]);console.log('PASS no JavaScript page errors; all checks complete');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
