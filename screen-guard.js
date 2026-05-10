// ===== SCREEN TIME GUARDIAN (shared across all pages) =====
// sessionStorage: 페이지간 세션 타이머 공유
// localStorage: 설정값 + 하루 총 사용시간 저장
const SCREEN_DEFAULT_MINUTES = 10;
const DAILY_LIMIT = 60 * 60 * 1000; // 하루 총 1시간
const SCREEN_LOCK_PIN_DEFAULT = '2580';
function getPin() { return localStorage.getItem('sg_pin') || SCREEN_LOCK_PIN_DEFAULT; }
function setPin(p) { localStorage.setItem('sg_pin', p); }
const PIN_MAX_ATTEMPTS = 3;
const PIN_ATTEMPTS_KEY = 'sg_pin_attempts';

function loadPinAttempts() {
  try { return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY)) || 0; } catch(e) { return 0; }
}
function savePinAttempts(n) {
  try { localStorage.setItem(PIN_ATTEMPTS_KEY, n); } catch(e) {}
}
function resetPinAttempts() { savePinAttempts(0); }
function isPinBruteBlocked() { return loadPinAttempts() >= PIN_MAX_ATTEMPTS; }

// ── 세션 타이머 설정값 (localStorage, 하루 지나면 리셋) ──
function loadScreenLimit() {
  try {
    const raw = localStorage.getItem('sg_limit');
    if (raw) {
      const d = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (d.date === today && d.minutes >= 1 && d.minutes <= 60) {
        return d.minutes * 60 * 1000;
      }
      localStorage.removeItem('sg_limit');
    }
  } catch(e) {}
  return SCREEN_DEFAULT_MINUTES * 60 * 1000;
}

let SCREEN_USE_LIMIT = loadScreenLimit();

// ── 하루 총 사용시간 추적 (localStorage) ──
function loadDailyUsage() {
  try {
    const raw = localStorage.getItem('sg_daily');
    if (raw) {
      const d = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (d.date === today) {
        return { used: d.used || 0, allowed: d.allowed || DAILY_LIMIT, hardLocked: d.hardLocked || false };
      }
      // 날짜 다름 → 리셋
      localStorage.removeItem('sg_daily');
    }
  } catch(e) {}
  return { used: 0, allowed: DAILY_LIMIT, hardLocked: false };
}
function saveDailyUsage() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem('sg_daily', JSON.stringify({
      date: today, used: dailyUsed, allowed: dailyAllowed, hardLocked: dailyHardLocked
    }));
  } catch(e) {}
}

let { used: dailyUsed, allowed: dailyAllowed, hardLocked: dailyHardLocked } = loadDailyUsage();

let screenStartTime = Date.now();
let screenAlertTimer = null;
let screenLocked = false;
let screenLockTime = null;
let screenLockCountdown = null;
let dailyTrackTimer = null; // 1초마다 사용시간 누적

// ── 하루 총 사용시간 체크 ──
function isDailyLimitReached() {
  return dailyUsed >= dailyAllowed;
}

function startDailyTracker() {
  clearInterval(dailyTrackTimer);
  dailyTrackTimer = setInterval(() => {
    if (!screenLocked && !document.hidden) {
      dailyUsed += 1000;
      saveDailyUsage();
      if (isDailyLimitReached()) {
        clearInterval(dailyTrackTimer);
        activateHardLock();
      }
    }
  }, 1000);
}

function stopDailyTracker() {
  clearInterval(dailyTrackTimer);
  dailyTrackTimer = null;
  saveDailyUsage(); // 멈추기 전에 반드시 저장
}

// ── 완전 잠금 (하루 한도 초과 — 퀴즈 없음, 비번만) ──
function activateHardLock() {
  dailyHardLocked = true;
  screenLocked = true;
  screenLockTime = null;
  clearTimeout(screenAlertTimer);
  clearInterval(screenLockCountdown);
  stopDailyTracker();
  saveDailyUsage();
  sgSave();

  document.getElementById('screenLockInput').value = '';
  document.getElementById('screenLockError').textContent = '';
  document.getElementById('screenLockOverlay').classList.add('show');

  if (isPinBruteBlocked()) { showBruteBlock(); return; }

  // 퀴즈 패널 닫기
  const qp = document.getElementById('quizPanel');
  if (qp) qp.classList.remove('show');

  // 하드락 UI: 퀴즈 버튼 숨기기, 카운트다운 대신 메시지
  const divider = document.querySelector('#screenLockOverlay .screen-lock-divider');
  const quizBtn = document.querySelector('#screenLockOverlay .quiz-challenge-btn');
  if (divider) divider.style.display = 'none';
  if (quizBtn) quizBtn.style.display = 'none';

  document.querySelector('#screenLockOverlay .screen-lock-msg').innerHTML =
    '오늘 사용 시간 끝! 📵<br>내일 다시 만나자!';
  document.getElementById('screenLockSub').innerHTML =
    `오늘 총 <b>${Math.round(dailyUsed/60000)}분</b> 사용했어요<br>아빠 비밀번호로만 풀 수 있어요`;
}

// ── 하드락에서 비번으로 풀기 (1시간 추가) ──
function hardUnlock() {
  dailyHardLocked = false;
  dailyAllowed += DAILY_LIMIT; // 1시간 추가
  saveDailyUsage();

  // UI 복원
  const divider = document.querySelector('#screenLockOverlay .screen-lock-divider');
  const quizBtn = document.querySelector('#screenLockOverlay .quiz-challenge-btn');
  if (divider) divider.style.display = '';
  if (quizBtn) quizBtn.style.display = '';
  document.querySelector('#screenLockOverlay .screen-lock-msg').innerHTML =
    '사용 시간 초과!<br>잠금되었습니다';

  doUnlock();
}

// ── sessionStorage sync (세션 타이머) ──
function sgSave() {
  try {
    sessionStorage.setItem('sg_data', JSON.stringify({
      start: screenStartTime,
      locked: screenLocked,
      lockTime: screenLockTime
    }));
  } catch(e) {}
}
function sgLoad() {
  try {
    // 날짜 변경 체크 → 리셋
    const daily = loadDailyUsage();
    dailyUsed = daily.used;
    dailyAllowed = daily.allowed;
    dailyHardLocked = daily.hardLocked;

    if (dailyHardLocked) {
      setTimeout(() => activateHardLock(), 50);
      return;
    }
    if (isDailyLimitReached()) {
      setTimeout(() => activateHardLock(), 50);
      return;
    }

    const raw = sessionStorage.getItem('sg_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    screenStartTime = d.start || Date.now();
    if (d.locked && d.lockTime) {
      screenLocked = true;
      screenLockTime = d.lockTime;
      setTimeout(() => activateLock(), 50);
      return;
    }
    // 남은 세션 시간 계산
    const elapsed = Date.now() - screenStartTime;
    if (elapsed < SCREEN_USE_LIMIT) {
      scheduleScreenLock(SCREEN_USE_LIMIT - elapsed);
    } else {
      activateLock();
    }
  } catch(e) {}
}

function startScreenTimer() {
  if (screenLocked) return;
  // 하루 한도 체크
  if (isDailyLimitReached()) { activateHardLock(); return; }
  clearTimeout(screenAlertTimer);
  screenStartTime = Date.now();
  sgSave();
  scheduleScreenLock(SCREEN_USE_LIMIT);
  startDailyTracker();
}

function scheduleScreenLock(delay) {
  if (screenLocked) return;
  clearTimeout(screenAlertTimer);
  screenAlertTimer = setTimeout(() => activateLock(), delay);
}

// ── 세션 잠금 (퀴즈로 풀 수 있음) ──
function activateLock() {
  // 하루 한도 체크 먼저
  if (isDailyLimitReached()) { activateHardLock(); return; }

  screenLocked = true;
  screenLockTime = screenLockTime || Date.now();
  clearTimeout(screenAlertTimer);
  stopDailyTracker();
  sgSave();

  document.getElementById('screenLockInput').value = '';
  document.getElementById('screenLockError').textContent = '';

  if (isPinBruteBlocked()) {
    document.getElementById('screenLockOverlay').classList.add('show');
    showBruteBlock(); return;
  }

  // 퀴즈 버튼 보이게 (하드락 아님)
  const divider = document.querySelector('#screenLockOverlay .screen-lock-divider');
  const quizBtn = document.querySelector('#screenLockOverlay .quiz-challenge-btn');
  if (divider) divider.style.display = '';
  if (quizBtn) quizBtn.style.display = '';
  document.querySelector('#screenLockOverlay .screen-lock-msg').innerHTML =
    '사용 시간 초과!<br>잠금되었습니다';

  document.getElementById('screenLockOverlay').classList.add('show');
  updateLockCountdown();
  clearInterval(screenLockCountdown);
  screenLockCountdown = setInterval(updateLockCountdown, 1000);

  // 바로 프랑스어 퀴즈 시작
  setTimeout(() => startFrenchQuiz(), 300);
}

function updateLockCountdown() {
  const usedMin = Math.round(dailyUsed / 60000);
  const remainMin = Math.max(0, Math.round((dailyAllowed - dailyUsed) / 60000));
  document.getElementById('screenLockSub').innerHTML =
    `오늘 총 <b>${usedMin}분</b> 사용 · 남은 한도 <b>${remainMin}분</b><br>아빠한테 말해서 풀어달라고 해`;
}

function doUnlock() {
  screenLocked = false;
  screenLockTime = null;
  clearInterval(screenLockCountdown);
  screenLockCountdown = null;
  document.getElementById('screenLockOverlay').classList.remove('show');
  document.getElementById('screenLockInput').value = '';
  document.getElementById('screenLockError').textContent = '';
  startScreenTimer();
}

function showBruteBlock() {
  const overlay = document.getElementById('screenLockOverlay');
  const box = overlay.querySelector('.screen-lock-box');
  box.innerHTML = '<div style="font-size:80px;margin-bottom:20px;">😜</div>' +
    '<div style="font-size:48px;font-weight:900;color:#ff6b6b;line-height:1.4;">메롱~~ㅋㅋㅋ</div>' +
    '<div style="font-size:14px;color:#666;margin-top:20px;">더 이상 비번을 넣을 수 없어요~</div>';
}

function unlockScreen() {
  if (isPinBruteBlocked()) { showBruteBlock(); return; }
  const input = document.getElementById('screenLockInput');
  const error = document.getElementById('screenLockError');
  if (input.value === getPin()) {
    resetPinAttempts();
    if (dailyHardLocked) {
      hardUnlock();
    } else {
      doUnlock();
    }
  } else {
    const attempts = loadPinAttempts() + 1;
    savePinAttempts(attempts);
    if (attempts >= PIN_MAX_ATTEMPTS) {
      showBruteBlock();
      return;
    }
    error.textContent = '비밀번호가 틀렸어요!';
    input.value = '';
    input.focus();
    const box = input.closest('.screen-lock-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease-out';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // 화면 꺼짐 → 즉시 저장
    saveDailyUsage();
    sgSave();
    clearTimeout(screenAlertTimer);
    stopDailyTracker();
    return;
  }
  // 화면 켜짐 → 날짜 체크 포함 리로드
  SCREEN_USE_LIMIT = loadScreenLimit(); // 설정값도 리로드
  sgLoad();
  if (dailyHardLocked) return;
  if (screenLocked) {
    updateLockCountdown();
    return;
  }
  startDailyTracker();
});

// 페이지 떠날 때 상태 저장 (Android에서 불안정할 수 있어서 중복 저장)
function saveAllState() { sgSave(); saveDailyUsage(); }
window.addEventListener('beforeunload', saveAllState);
window.addEventListener('pagehide', saveAllState);
document.addEventListener('freeze', saveAllState); // Android Chrome background

// ===== FRENCH VOCABULARY QUIZ (300+ essential words) =====
const FRENCH_VOCAB = [
  // ── Verbs (essential, intermediate) ──
  {fr:'avoir',en:'to have',cat:'verb'},{fr:'être',en:'to be',cat:'verb'},
  {fr:'faire',en:'to do / to make',cat:'verb'},{fr:'aller',en:'to go',cat:'verb'},
  {fr:'venir',en:'to come',cat:'verb'},{fr:'voir',en:'to see',cat:'verb'},
  {fr:'savoir',en:'to know (fact)',cat:'verb'},{fr:'connaître',en:'to know (person/place)',cat:'verb'},
  {fr:'pouvoir',en:'to be able to',cat:'verb'},{fr:'vouloir',en:'to want',cat:'verb'},
  {fr:'devoir',en:'to must / to owe',cat:'verb'},{fr:'dire',en:'to say / to tell',cat:'verb'},
  {fr:'prendre',en:'to take',cat:'verb'},{fr:'donner',en:'to give',cat:'verb'},
  {fr:'parler',en:'to speak',cat:'verb'},{fr:'penser',en:'to think',cat:'verb'},
  {fr:'croire',en:'to believe',cat:'verb'},{fr:'trouver',en:'to find',cat:'verb'},
  {fr:'chercher',en:'to look for',cat:'verb'},{fr:'mettre',en:'to put / to wear',cat:'verb'},
  {fr:'comprendre',en:'to understand',cat:'verb'},{fr:'apprendre',en:'to learn',cat:'verb'},
  {fr:'attendre',en:'to wait',cat:'verb'},{fr:'entendre',en:'to hear',cat:'verb'},
  {fr:'répondre',en:'to answer',cat:'verb'},{fr:'demander',en:'to ask',cat:'verb'},
  {fr:'commencer',en:'to begin',cat:'verb'},{fr:'finir',en:'to finish',cat:'verb'},
  {fr:'ouvrir',en:'to open',cat:'verb'},{fr:'fermer',en:'to close',cat:'verb'},
  {fr:'acheter',en:'to buy',cat:'verb'},{fr:'vendre',en:'to sell',cat:'verb'},
  {fr:'envoyer',en:'to send',cat:'verb'},{fr:'recevoir',en:'to receive',cat:'verb'},
  {fr:'laisser',en:'to leave / to let',cat:'verb'},{fr:'tomber',en:'to fall',cat:'verb'},
  {fr:'monter',en:'to go up / to climb',cat:'verb'},{fr:'descendre',en:'to go down',cat:'verb'},
  {fr:'marcher',en:'to walk',cat:'verb'},{fr:'courir',en:'to run',cat:'verb'},
  {fr:'conduire',en:'to drive',cat:'verb'},{fr:'voyager',en:'to travel',cat:'verb'},
  {fr:'essayer',en:'to try',cat:'verb'},{fr:'utiliser',en:'to use',cat:'verb'},
  {fr:'choisir',en:'to choose',cat:'verb'},{fr:'oublier',en:'to forget',cat:'verb'},
  {fr:'se souvenir',en:'to remember',cat:'verb'},{fr:'aider',en:'to help',cat:'verb'},
  {fr:'expliquer',en:'to explain',cat:'verb'},{fr:'raconter',en:'to tell (story)',cat:'verb'},
  {fr:'montrer',en:'to show',cat:'verb'},{fr:'sembler',en:'to seem',cat:'verb'},
  {fr:'rester',en:'to stay',cat:'verb'},{fr:'partir',en:'to leave / depart',cat:'verb'},
  {fr:'sortir',en:'to go out',cat:'verb'},{fr:'entrer',en:'to enter',cat:'verb'},
  {fr:'arriver',en:'to arrive',cat:'verb'},{fr:'rentrer',en:'to return home',cat:'verb'},
  {fr:'manger',en:'to eat',cat:'verb'},{fr:'boire',en:'to drink',cat:'verb'},
  {fr:'dormir',en:'to sleep',cat:'verb'},{fr:'se réveiller',en:'to wake up',cat:'verb'},
  {fr:'se lever',en:'to get up',cat:'verb'},{fr:'se coucher',en:'to go to bed',cat:'verb'},
  {fr:'lire',en:'to read',cat:'verb'},{fr:'écrire',en:'to write',cat:'verb'},
  {fr:'jouer',en:'to play',cat:'verb'},{fr:'travailler',en:'to work',cat:'verb'},
  {fr:'étudier',en:'to study',cat:'verb'},{fr:'porter',en:'to carry / to wear',cat:'verb'},
  {fr:'changer',en:'to change',cat:'verb'},{fr:'perdre',en:'to lose',cat:'verb'},
  {fr:'gagner',en:'to win / to earn',cat:'verb'},{fr:'payer',en:'to pay',cat:'verb'},
  {fr:'sentir',en:'to feel / to smell',cat:'verb'},{fr:'tenir',en:'to hold',cat:'verb'},
  {fr:'suivre',en:'to follow',cat:'verb'},{fr:'vivre',en:'to live',cat:'verb'},
  // ── Adjectives ──
  {fr:'grand',en:'big / tall',cat:'adj'},{fr:'petit',en:'small / short',cat:'adj'},
  {fr:'bon',en:'good',cat:'adj'},{fr:'mauvais',en:'bad',cat:'adj'},
  {fr:'beau / belle',en:'beautiful',cat:'adj'},{fr:'laid',en:'ugly',cat:'adj'},
  {fr:'jeune',en:'young',cat:'adj'},{fr:'vieux / vieille',en:'old',cat:'adj'},
  {fr:'nouveau / nouvelle',en:'new',cat:'adj'},{fr:'ancien',en:'old / former',cat:'adj'},
  {fr:'long / longue',en:'long',cat:'adj'},{fr:'court',en:'short (length)',cat:'adj'},
  {fr:'haut',en:'high / tall',cat:'adj'},{fr:'bas',en:'low',cat:'adj'},
  {fr:'gros / grosse',en:'fat / big',cat:'adj'},{fr:'mince',en:'thin / slim',cat:'adj'},
  {fr:'fort',en:'strong',cat:'adj'},{fr:'faible',en:'weak',cat:'adj'},
  {fr:'rapide',en:'fast',cat:'adj'},{fr:'lent',en:'slow',cat:'adj'},
  {fr:'facile',en:'easy',cat:'adj'},{fr:'difficile',en:'difficult',cat:'adj'},
  {fr:'possible',en:'possible',cat:'adj'},{fr:'impossible',en:'impossible',cat:'adj'},
  {fr:'important',en:'important',cat:'adj'},{fr:'nécessaire',en:'necessary',cat:'adj'},
  {fr:'différent',en:'different',cat:'adj'},{fr:'même',en:'same',cat:'adj'},
  {fr:'seul',en:'alone / only',cat:'adj'},{fr:'ensemble',en:'together',cat:'adj'},
  {fr:'chaud',en:'hot / warm',cat:'adj'},{fr:'froid',en:'cold',cat:'adj'},
  {fr:'propre',en:'clean / own',cat:'adj'},{fr:'sale',en:'dirty',cat:'adj'},
  {fr:'plein',en:'full',cat:'adj'},{fr:'vide',en:'empty',cat:'adj'},
  {fr:'ouvert',en:'open',cat:'adj'},{fr:'fermé',en:'closed',cat:'adj'},
  {fr:'heureux / heureuse',en:'happy',cat:'adj'},{fr:'triste',en:'sad',cat:'adj'},
  {fr:'content',en:'pleased / glad',cat:'adj'},{fr:'fâché',en:'angry',cat:'adj'},
  {fr:'fatigué',en:'tired',cat:'adj'},{fr:'malade',en:'sick',cat:'adj'},
  {fr:'prêt',en:'ready',cat:'adj'},{fr:'sûr',en:'sure / safe',cat:'adj'},
  {fr:'libre',en:'free',cat:'adj'},{fr:'occupé',en:'busy',cat:'adj'},
  {fr:'gentil / gentille',en:'kind / nice',cat:'adj'},{fr:'méchant',en:'mean / naughty',cat:'adj'},
  {fr:'intéressant',en:'interesting',cat:'adj'},{fr:'ennuyeux',en:'boring',cat:'adj'},
  {fr:'dangereux',en:'dangerous',cat:'adj'},{fr:'tranquille',en:'calm / quiet',cat:'adj'},
  {fr:'dernier / dernière',en:'last',cat:'adj'},{fr:'prochain',en:'next',cat:'adj'},
  {fr:'premier / première',en:'first',cat:'adj'},{fr:'cher / chère',en:'expensive / dear',cat:'adj'},
  // ── Adverbs & Connectors ──
  {fr:'très',en:'very',cat:'adverb'},{fr:'trop',en:'too much',cat:'adverb'},
  {fr:'assez',en:'enough / quite',cat:'adverb'},{fr:'peu',en:'little / few',cat:'adverb'},
  {fr:'beaucoup',en:'a lot / many',cat:'adverb'},{fr:'plus',en:'more',cat:'adverb'},
  {fr:'moins',en:'less',cat:'adverb'},{fr:'bien',en:'well',cat:'adverb'},
  {fr:'mal',en:'badly',cat:'adverb'},{fr:'vite',en:'quickly',cat:'adverb'},
  {fr:'souvent',en:'often',cat:'adverb'},{fr:'toujours',en:'always',cat:'adverb'},
  {fr:'jamais',en:'never',cat:'adverb'},{fr:'parfois',en:'sometimes',cat:'adverb'},
  {fr:'déjà',en:'already',cat:'adverb'},{fr:'encore',en:'still / again',cat:'adverb'},
  {fr:'maintenant',en:'now',cat:'adverb'},{fr:'bientôt',en:'soon',cat:'adverb'},
  {fr:'ici',en:'here',cat:'adverb'},{fr:'là-bas',en:'over there',cat:'adverb'},
  {fr:'partout',en:'everywhere',cat:'adverb'},{fr:'ensemble',en:'together',cat:'adverb'},
  {fr:'surtout',en:'especially',cat:'adverb'},{fr:'environ',en:'about / approximately',cat:'adverb'},
  {fr:'peut-être',en:'maybe / perhaps',cat:'adverb'},{fr:'vraiment',en:'really / truly',cat:'adverb'},
  {fr:'seulement',en:'only',cat:'adverb'},{fr:'plutôt',en:'rather',cat:'adverb'},
  // ── Prepositions & Small Words ──
  {fr:'dans',en:'in / inside',cat:'preposition'},{fr:'sur',en:'on / upon',cat:'preposition'},
  {fr:'sous',en:'under',cat:'preposition'},{fr:'devant',en:'in front of',cat:'preposition'},
  {fr:'derrière',en:'behind',cat:'preposition'},{fr:'entre',en:'between',cat:'preposition'},
  {fr:'avec',en:'with',cat:'preposition'},{fr:'sans',en:'without',cat:'preposition'},
  {fr:'pour',en:'for',cat:'preposition'},{fr:'contre',en:'against',cat:'preposition'},
  {fr:'vers',en:'towards',cat:'preposition'},{fr:'chez',en:'at (someone\'s place)',cat:'preposition'},
  {fr:'pendant',en:'during',cat:'preposition'},{fr:'depuis',en:'since / for (time)',cat:'preposition'},
  {fr:'avant',en:'before',cat:'preposition'},{fr:'après',en:'after',cat:'preposition'},
  {fr:'à côté de',en:'next to',cat:'preposition'},{fr:'loin de',en:'far from',cat:'preposition'},
  {fr:'près de',en:'near / close to',cat:'preposition'},{fr:'au-dessus de',en:'above',cat:'preposition'},
  // ── Everyday Life & Society ──
  {fr:'la ville',en:'city / town',cat:'society'},{fr:'le pays',en:'country',cat:'society'},
  {fr:'la rue',en:'street',cat:'society'},{fr:'le magasin',en:'shop / store',cat:'society'},
  {fr:'le restaurant',en:'restaurant',cat:'society'},{fr:'la gare',en:'train station',cat:'society'},
  {fr:"l'aéroport",en:'airport',cat:'society'},{fr:"l'hôpital",en:'hospital',cat:'society'},
  {fr:'la banque',en:'bank',cat:'society'},{fr:'la poste',en:'post office',cat:'society'},
  {fr:'le musée',en:'museum',cat:'society'},{fr:'le cinéma',en:'cinema',cat:'society'},
  {fr:'la bibliothèque',en:'library',cat:'society'},{fr:'le marché',en:'market',cat:'society'},
  {fr:'la pharmacie',en:'pharmacy',cat:'society'},{fr:'le parc',en:'park',cat:'society'},
  {fr:'le travail',en:'work / job',cat:'society'},{fr:'le bureau',en:'office / desk',cat:'society'},
  {fr:"l'argent",en:'money',cat:'society'},{fr:'le prix',en:'price',cat:'society'},
  {fr:'la voiture',en:'car',cat:'society'},{fr:'le bus',en:'bus',cat:'society'},
  {fr:'le train',en:'train',cat:'society'},{fr:'le vélo',en:'bicycle',cat:'society'},
  {fr:"l'avion",en:'airplane',cat:'society'},{fr:'le bateau',en:'boat / ship',cat:'society'},
  // ── Emotions & States ──
  {fr:'la joie',en:'joy',cat:'emotion'},{fr:'la peur',en:'fear',cat:'emotion'},
  {fr:'la colère',en:'anger',cat:'emotion'},{fr:'la surprise',en:'surprise',cat:'emotion'},
  {fr:"l'amour",en:'love',cat:'emotion'},{fr:'la tristesse',en:'sadness',cat:'emotion'},
  {fr:"l'espoir",en:'hope',cat:'emotion'},{fr:'la confiance',en:'trust / confidence',cat:'emotion'},
  {fr:"l'inquiétude",en:'worry / anxiety',cat:'emotion'},{fr:'la fierté',en:'pride',cat:'emotion'},
  {fr:'le bonheur',en:'happiness',cat:'emotion'},{fr:'le courage',en:'courage',cat:'emotion'},
  // ── Time & Calendar ──
  {fr:'le matin',en:'morning',cat:'time'},{fr:"l'après-midi",en:'afternoon',cat:'time'},
  {fr:'le soir',en:'evening',cat:'time'},{fr:'la nuit',en:'night',cat:'time'},
  {fr:'la semaine',en:'week',cat:'time'},{fr:'le mois',en:'month',cat:'time'},
  {fr:"l'année",en:'year',cat:'time'},{fr:'la saison',en:'season',cat:'time'},
  {fr:'le printemps',en:'spring',cat:'time'},{fr:"l'été",en:'summer',cat:'time'},
  {fr:"l'automne",en:'autumn / fall',cat:'time'},{fr:"l'hiver",en:'winter',cat:'time'},
  {fr:"aujourd'hui",en:'today',cat:'time'},{fr:'demain',en:'tomorrow',cat:'time'},
  {fr:'hier',en:'yesterday',cat:'time'},{fr:'tôt',en:'early',cat:'time'},
  {fr:'tard',en:'late',cat:'time'},{fr:'une heure',en:'one hour / one o\'clock',cat:'time'},
  {fr:'une minute',en:'one minute',cat:'time'},{fr:'une seconde',en:'one second',cat:'time'},
  // ── School & Education ──
  {fr:"l'école",en:'school',cat:'school'},{fr:'le collège',en:'middle school',cat:'school'},
  {fr:'le lycée',en:'high school',cat:'school'},{fr:"l'université",en:'university',cat:'school'},
  {fr:'le cours',en:'class / lesson',cat:'school'},{fr:"l'examen",en:'exam',cat:'school'},
  {fr:'la note',en:'grade / mark',cat:'school'},{fr:'les devoirs',en:'homework',cat:'school'},
  {fr:'le professeur',en:'teacher',cat:'school'},{fr:"l'élève",en:'student',cat:'school'},
  {fr:'les mathématiques',en:'mathematics',cat:'school'},{fr:'les sciences',en:'science',cat:'school'},
  {fr:"l'histoire",en:'history',cat:'school'},{fr:'la géographie',en:'geography',cat:'school'},
  {fr:'le français',en:'French (subject)',cat:'school'},{fr:"l'anglais",en:'English (subject)',cat:'school'},
  {fr:'la musique',en:'music',cat:'school'},{fr:'le sport',en:'sport / P.E.',cat:'school'},
  {fr:'le dessin',en:'drawing / art',cat:'school'},{fr:'la récréation',en:'break / recess',cat:'school'},
  // ── Food & Cooking ──
  {fr:'le repas',en:'meal',cat:'food'},{fr:'le petit-déjeuner',en:'breakfast',cat:'food'},
  {fr:'le déjeuner',en:'lunch',cat:'food'},{fr:'le dîner',en:'dinner',cat:'food'},
  {fr:'la viande',en:'meat',cat:'food'},{fr:'le poisson',en:'fish',cat:'food'},
  {fr:'les légumes',en:'vegetables',cat:'food'},{fr:'les fruits',en:'fruits',cat:'food'},
  {fr:'le pain',en:'bread',cat:'food'},{fr:'le fromage',en:'cheese',cat:'food'},
  {fr:"l'eau",en:'water',cat:'food'},{fr:'le jus',en:'juice',cat:'food'},
  {fr:'le sel',en:'salt',cat:'food'},{fr:'le sucre',en:'sugar',cat:'food'},
  {fr:"l'huile",en:'oil',cat:'food'},{fr:'la recette',en:'recipe',cat:'food'},
  {fr:'la cuisine',en:'cooking / kitchen',cat:'food'},{fr:'le plat',en:'dish / course',cat:'food'},
  {fr:"l'assiette",en:'plate',cat:'food'},{fr:'le verre',en:'glass',cat:'food'},
  // ── Useful Phrases & Expressions ──
  {fr:'bien sûr',en:'of course',cat:'phrase'},{fr:"d'accord",en:'okay / agreed',cat:'phrase'},
  {fr:'pas du tout',en:'not at all',cat:'phrase'},{fr:'à bientôt',en:'see you soon',cat:'phrase'},
  {fr:'comment ça va ?',en:'how are you?',cat:'phrase'},{fr:'ça va bien',en:'I\'m fine',cat:'phrase'},
  {fr:'je ne sais pas',en:'I don\'t know',cat:'phrase'},{fr:"j'ai besoin de",en:'I need',cat:'phrase'},
  {fr:"je voudrais",en:'I would like',cat:'phrase'},{fr:"il y a",en:'there is / there are',cat:'phrase'},
  {fr:"qu'est-ce que c'est ?",en:'what is it?',cat:'phrase'},{fr:'combien ?',en:'how much / how many?',cat:'phrase'},
  {fr:'pourquoi ?',en:'why?',cat:'phrase'},{fr:'comment ?',en:'how?',cat:'phrase'},
  {fr:'quand ?',en:'when?',cat:'phrase'},{fr:'où ?',en:'where?',cat:'phrase'},
  {fr:'qui ?',en:'who?',cat:'phrase'},{fr:'parce que',en:'because',cat:'phrase'},
  {fr:'en fait',en:'actually / in fact',cat:'phrase'},{fr:'par exemple',en:'for example',cat:'phrase'},
  {fr:"c'est-à-dire",en:'that is to say',cat:'phrase'},{fr:"tout à fait",en:'absolutely / exactly',cat:'phrase'},
  {fr:'de rien',en:'you\'re welcome',cat:'phrase'},{fr:'enchanté',en:'nice to meet you',cat:'phrase'},
  // ── Nature & Weather ──
  {fr:'le soleil',en:'sun',cat:'nature'},{fr:'la pluie',en:'rain',cat:'nature'},
  {fr:'la neige',en:'snow',cat:'nature'},{fr:'le vent',en:'wind',cat:'nature'},
  {fr:'le nuage',en:'cloud',cat:'nature'},{fr:"l'orage",en:'storm',cat:'nature'},
  {fr:'le brouillard',en:'fog',cat:'nature'},{fr:'la température',en:'temperature',cat:'nature'},
  {fr:'la mer',en:'sea',cat:'nature'},{fr:'la rivière',en:'river',cat:'nature'},
  {fr:'le lac',en:'lake',cat:'nature'},{fr:'la forêt',en:'forest',cat:'nature'},
  {fr:'la montagne',en:'mountain',cat:'nature'},{fr:'le ciel',en:'sky',cat:'nature'},
  {fr:"l'étoile",en:'star',cat:'nature'},{fr:'la lune',en:'moon',cat:'nature'},
  {fr:"l'arbre",en:'tree',cat:'nature'},{fr:'la fleur',en:'flower',cat:'nature'},
  {fr:"l'herbe",en:'grass',cat:'nature'},{fr:'la terre',en:'earth / ground',cat:'nature'},
  // ── House & Home ──
  {fr:'la maison',en:'house',cat:'house'},{fr:"l'appartement",en:'apartment',cat:'house'},
  {fr:'la chambre',en:'bedroom',cat:'house'},{fr:'la cuisine',en:'kitchen (room)',cat:'house'},
  {fr:'la salle de bain',en:'bathroom',cat:'house'},{fr:'le salon',en:'living room',cat:'house'},
  {fr:'le couloir',en:'hallway',cat:'house'},{fr:"l'escalier",en:'stairs',cat:'house'},
  {fr:'le toit',en:'roof',cat:'house'},{fr:'le mur',en:'wall',cat:'house'},
  {fr:'le plancher',en:'floor',cat:'house'},{fr:'la porte',en:'door',cat:'house'},
  {fr:'la fenêtre',en:'window',cat:'house'},{fr:'le jardin',en:'garden',cat:'house'},
  {fr:'la clé',en:'key',cat:'house'},{fr:'le lit',en:'bed',cat:'house'},
  // ── Body & Health ──
  {fr:'la tête',en:'head',cat:'body'},{fr:'les yeux',en:'eyes',cat:'body'},
  {fr:'le nez',en:'nose',cat:'body'},{fr:'la bouche',en:'mouth',cat:'body'},
  {fr:"l'oreille",en:'ear',cat:'body'},{fr:'le visage',en:'face',cat:'body'},
  {fr:'le cou',en:'neck',cat:'body'},{fr:"l'épaule",en:'shoulder',cat:'body'},
  {fr:'le bras',en:'arm',cat:'body'},{fr:'la main',en:'hand',cat:'body'},
  {fr:'le doigt',en:'finger',cat:'body'},{fr:'la jambe',en:'leg',cat:'body'},
  {fr:'le genou',en:'knee',cat:'body'},{fr:'le pied',en:'foot',cat:'body'},
  {fr:'le coeur',en:'heart',cat:'body'},{fr:'le dos',en:'back',cat:'body'},
  {fr:'le ventre',en:'stomach / belly',cat:'body'},{fr:'la santé',en:'health',cat:'body'},
  {fr:'le médecin',en:'doctor',cat:'body'},{fr:'le médicament',en:'medicine / drug',cat:'body'},
  // ── Family & People ──
  {fr:'la mère',en:'mother',cat:'family'},{fr:'le père',en:'father',cat:'family'},
  {fr:'le frère',en:'brother',cat:'family'},{fr:'la soeur',en:'sister',cat:'family'},
  {fr:'le fils',en:'son',cat:'family'},{fr:'la fille',en:'daughter / girl',cat:'family'},
  {fr:'le mari',en:'husband',cat:'family'},{fr:'la femme',en:'wife / woman',cat:'family'},
  {fr:"l'enfant",en:'child',cat:'family'},{fr:'le bébé',en:'baby',cat:'family'},
  {fr:"l'ami / l'amie",en:'friend',cat:'family'},{fr:'le voisin',en:'neighbour',cat:'family'},
  {fr:'les gens',en:'people',cat:'family'},{fr:'un homme',en:'a man',cat:'family'},
  {fr:'une femme',en:'a woman',cat:'family'},{fr:'un garçon',en:'a boy',cat:'family'},
];

// ===== LATIN QUIZ (beginner-intermediate vocab + grammar) =====
const LATIN_VOCAB = [
  // ── Verbs (1st conjugation -āre) ──
  {la:'amāre',en:'to love',cat:'verb'},{la:'laudāre',en:'to praise',cat:'verb'},
  {la:'vocāre',en:'to call',cat:'verb'},{la:'portāre',en:'to carry',cat:'verb'},
  {la:'nārrāre',en:'to tell / narrate',cat:'verb'},{la:'labōrāre',en:'to work',cat:'verb'},
  {la:'pugnāre',en:'to fight',cat:'verb'},{la:'navigāre',en:'to sail',cat:'verb'},
  {la:'spectāre',en:'to watch / look at',cat:'verb'},{la:'parāre',en:'to prepare',cat:'verb'},
  {la:'superāre',en:'to overcome',cat:'verb'},{la:'errāre',en:'to wander / err',cat:'verb'},
  {la:'negāre',en:'to deny',cat:'verb'},{la:'iuvāre',en:'to help / please',cat:'verb'},
  {la:'servāre',en:'to save / keep',cat:'verb'},{la:'stāre',en:'to stand',cat:'verb'},
  {la:'dāre',en:'to give',cat:'verb'},{la:'rogāre',en:'to ask',cat:'verb'},
  {la:'cēnāre',en:'to dine',cat:'verb'},{la:'habitāre',en:'to live / inhabit',cat:'verb'},
  // ── Verbs (2nd conjugation -ēre) ──
  {la:'monēre',en:'to warn / advise',cat:'verb'},{la:'habēre',en:'to have / hold',cat:'verb'},
  {la:'vidēre',en:'to see',cat:'verb'},{la:'timēre',en:'to fear',cat:'verb'},
  {la:'docēre',en:'to teach',cat:'verb'},{la:'tenēre',en:'to hold / keep',cat:'verb'},
  {la:'movēre',en:'to move',cat:'verb'},{la:'respondēre',en:'to answer',cat:'verb'},
  {la:'manēre',en:'to remain / stay',cat:'verb'},{la:'ridēre',en:'to laugh',cat:'verb'},
  {la:'sedēre',en:'to sit',cat:'verb'},{la:'valēre',en:'to be strong / well',cat:'verb'},
  // ── Verbs (3rd conjugation -ere) ──
  {la:'dūcere',en:'to lead',cat:'verb'},{la:'dīcere',en:'to say / speak',cat:'verb'},
  {la:'scrībere',en:'to write',cat:'verb'},{la:'legere',en:'to read / choose',cat:'verb'},
  {la:'mittere',en:'to send',cat:'verb'},{la:'vincere',en:'to conquer',cat:'verb'},
  {la:'currere',en:'to run',cat:'verb'},{la:'agere',en:'to do / drive',cat:'verb'},
  {la:'petere',en:'to seek / attack',cat:'verb'},{la:'pōnere',en:'to put / place',cat:'verb'},
  {la:'quaerere',en:'to seek / ask',cat:'verb'},{la:'cadere',en:'to fall',cat:'verb'},
  {la:'bibere',en:'to drink',cat:'verb'},{la:'crēdere',en:'to believe / trust',cat:'verb'},
  {la:'gēnere',en:'to produce / create',cat:'verb'},{la:'ostendere',en:'to show',cat:'verb'},
  {la:'sūmere',en:'to take up',cat:'verb'},{la:'vertere',en:'to turn',cat:'verb'},
  // ── Verbs (4th conjugation -īre) ──
  {la:'audīre',en:'to hear / listen',cat:'verb'},{la:'venīre',en:'to come',cat:'verb'},
  {la:'dormīre',en:'to sleep',cat:'verb'},{la:'scīre',en:'to know',cat:'verb'},
  {la:'sentīre',en:'to feel / perceive',cat:'verb'},{la:'aperīre',en:'to open',cat:'verb'},
  {la:'invenīre',en:'to find / discover',cat:'verb'},{la:'munīre',en:'to fortify',cat:'verb'},
  // ── Irregular Verbs ──
  {la:'esse',en:'to be',cat:'verb'},{la:'posse',en:'to be able',cat:'verb'},
  {la:'ferre',en:'to carry / bear',cat:'verb'},{la:'īre',en:'to go',cat:'verb'},
  {la:'velle',en:'to want / wish',cat:'verb'},{la:'nōlle',en:'to not want',cat:'verb'},
  {la:'mālle',en:'to prefer',cat:'verb'},{la:'fierī',en:'to become / be made',cat:'verb'},
  // ── Nouns (1st declension -a, mostly feminine) ──
  {la:'puella',en:'girl',cat:'noun'},{la:'fēmina',en:'woman',cat:'noun'},
  {la:'aqua',en:'water',cat:'noun'},{la:'terra',en:'earth / land',cat:'noun'},
  {la:'via',en:'road / way',cat:'noun'},{la:'patria',en:'fatherland / country',cat:'noun'},
  {la:'insula',en:'island',cat:'noun'},{la:'fortūna',en:'fortune / luck',cat:'noun'},
  {la:'silva',en:'forest / woods',cat:'noun'},{la:'vita',en:'life',cat:'noun'},
  {la:'porta',en:'gate / door',cat:'noun'},{la:'fīlia',en:'daughter',cat:'noun'},
  {la:'causa',en:'cause / reason',cat:'noun'},{la:'cūra',en:'care / concern',cat:'noun'},
  {la:'glōria',en:'glory / fame',cat:'noun'},{la:'poena',en:'punishment / penalty',cat:'noun'},
  {la:'pecūnia',en:'money',cat:'noun'},{la:'rēgīna',en:'queen',cat:'noun'},
  {la:'sapientia',en:'wisdom',cat:'noun'},{la:'victōria',en:'victory',cat:'noun'},
  // ── Nouns (2nd declension -us/-um, mostly masculine/neuter) ──
  {la:'amīcus',en:'friend',cat:'noun'},{la:'puer',en:'boy',cat:'noun'},
  {la:'vir',en:'man',cat:'noun'},{la:'dominus',en:'master / lord',cat:'noun'},
  {la:'servus',en:'slave / servant',cat:'noun'},{la:'fīlius',en:'son',cat:'noun'},
  {la:'deus',en:'god',cat:'noun'},{la:'populus',en:'people / nation',cat:'noun'},
  {la:'animus',en:'mind / spirit',cat:'noun'},{la:'campus',en:'field / plain',cat:'noun'},
  {la:'bellum',en:'war',cat:'noun'},{la:'dōnum',en:'gift',cat:'noun'},
  {la:'oppidum',en:'town',cat:'noun'},{la:'periculum',en:'danger',cat:'noun'},
  {la:'verbum',en:'word',cat:'noun'},{la:'cōnsilium',en:'plan / advice',cat:'noun'},
  {la:'imperium',en:'command / empire',cat:'noun'},{la:'regnum',en:'kingdom',cat:'noun'},
  {la:'templum',en:'temple',cat:'noun'},{la:'caelum',en:'sky / heaven',cat:'noun'},
  // ── Nouns (3rd declension) ──
  {la:'rēx',en:'king',cat:'noun'},{la:'lēx',en:'law',cat:'noun'},
  {la:'vōx',en:'voice',cat:'noun'},{la:'pāx',en:'peace',cat:'noun'},
  {la:'lūx',en:'light',cat:'noun'},{la:'nox',en:'night',cat:'noun'},
  {la:'mīles',en:'soldier',cat:'noun'},{la:'dux',en:'leader / general',cat:'noun'},
  {la:'pater',en:'father',cat:'noun'},{la:'māter',en:'mother',cat:'noun'},
  {la:'frāter',en:'brother',cat:'noun'},{la:'soror',en:'sister',cat:'noun'},
  {la:'homō',en:'human / person',cat:'noun'},{la:'nōmen',en:'name',cat:'noun'},
  {la:'tempus',en:'time',cat:'noun'},{la:'corpus',en:'body',cat:'noun'},
  {la:'caput',en:'head',cat:'noun'},{la:'iter',en:'journey / route',cat:'noun'},
  {la:'flūmen',en:'river',cat:'noun'},{la:'mare',en:'sea',cat:'noun'},
  {la:'urbs',en:'city',cat:'noun'},{la:'mōns',en:'mountain',cat:'noun'},
  {la:'cīvis',en:'citizen',cat:'noun'},{la:'virtūs',en:'courage / virtue',cat:'noun'},
  {la:'mors',en:'death',cat:'noun'},{la:'salūs',en:'safety / health',cat:'noun'},
  // ── Adjectives ──
  {la:'bonus',en:'good',cat:'adj'},{la:'malus',en:'bad / evil',cat:'adj'},
  {la:'magnus',en:'great / large',cat:'adj'},{la:'parvus',en:'small / little',cat:'adj'},
  {la:'longus',en:'long',cat:'adj'},{la:'novus',en:'new',cat:'adj'},
  {la:'antīquus',en:'ancient / old',cat:'adj'},{la:'pulcher',en:'beautiful',cat:'adj'},
  {la:'fortis',en:'brave / strong',cat:'adj'},{la:'fēlīx',en:'happy / lucky',cat:'adj'},
  {la:'gravis',en:'heavy / serious',cat:'adj'},{la:'levis',en:'light / trivial',cat:'adj'},
  {la:'brevis',en:'short / brief',cat:'adj'},{la:'facilis',en:'easy',cat:'adj'},
  {la:'difficilis',en:'difficult',cat:'adj'},{la:'omnis',en:'every / all',cat:'adj'},
  {la:'multus',en:'much / many',cat:'adj'},{la:'paucī',en:'few',cat:'adj'},
  {la:'sōlus',en:'alone / only',cat:'adj'},{la:'tōtus',en:'whole / entire',cat:'adj'},
  {la:'prīmus',en:'first',cat:'adj'},{la:'ultimus',en:'last / final',cat:'adj'},
  {la:'liber',en:'free',cat:'adj'},{la:'sacer',en:'sacred / holy',cat:'adj'},
  {la:'celer',en:'swift / fast',cat:'adj'},{la:'acer',en:'sharp / fierce',cat:'adj'},
  {la:'certus',en:'certain / sure',cat:'adj'},{la:'dīgnus',en:'worthy',cat:'adj'},
  // ── Adverbs & Prepositions ──
  {la:'semper',en:'always',cat:'adverb'},{la:'numquam',en:'never',cat:'adverb'},
  {la:'saepe',en:'often',cat:'adverb'},{la:'iam',en:'now / already',cat:'adverb'},
  {la:'nōn',en:'not',cat:'adverb'},{la:'bene',en:'well',cat:'adverb'},
  {la:'male',en:'badly',cat:'adverb'},{la:'magnopere',en:'greatly',cat:'adverb'},
  {la:'diū',en:'for a long time',cat:'adverb'},{la:'mox',en:'soon',cat:'adverb'},
  {la:'tamen',en:'however / nevertheless',cat:'adverb'},{la:'etiam',en:'also / even',cat:'adverb'},
  {la:'cum',en:'with (+ abl.)',cat:'prep'},{la:'in',en:'in / into (+ abl./acc.)',cat:'prep'},
  {la:'ex / ē',en:'out of / from',cat:'prep'},{la:'ad',en:'to / toward (+ acc.)',cat:'prep'},
  {la:'per',en:'through (+ acc.)',cat:'prep'},{la:'prō',en:'for / on behalf of (+ abl.)',cat:'prep'},
  {la:'sine',en:'without (+ abl.)',cat:'prep'},{la:'inter',en:'between / among (+ acc.)',cat:'prep'},
  {la:'post',en:'after / behind (+ acc.)',cat:'prep'},{la:'ante',en:'before / in front of (+ acc.)',cat:'prep'},
  {la:'sub',en:'under (+ abl./acc.)',cat:'prep'},{la:'dē',en:'down from / about (+ abl.)',cat:'prep'},
  {la:'trāns',en:'across (+ acc.)',cat:'prep'},{la:'propter',en:'because of (+ acc.)',cat:'prep'},
  // ── Phrases & Expressions ──
  {la:'carpe diem',en:'seize the day',cat:'phrase'},{la:'vēnī, vīdī, vīcī',en:'I came, I saw, I conquered',cat:'phrase'},
  {la:'in memoriam',en:'in memory (of)',cat:'phrase'},{la:'ad hoc',en:'for this (purpose)',cat:'phrase'},
  {la:'et cetera',en:'and the rest',cat:'phrase'},{la:'per sē',en:'by itself / in itself',cat:'phrase'},
  {la:'vice versā',en:'the other way around',cat:'phrase'},{la:'bonā fidē',en:'in good faith',cat:'phrase'},
  {la:'status quō',en:'the existing state',cat:'phrase'},{la:'alma māter',en:'nourishing mother',cat:'phrase'},
];

// ===== LATIN GRAMMAR QUESTIONS =====
const LATIN_GRAMMAR = [
  // ── Verb conjugation: Present Active Indicative ──
  {q:'amō, amās, amat — what conjugation?',a:'1st conjugation',opts:['1st conjugation','2nd conjugation','3rd conjugation','4th conjugation'],cat:'conjugation'},
  {q:'moneō, monēs, monet — what conjugation?',a:'2nd conjugation',opts:['1st conjugation','2nd conjugation','3rd conjugation','4th conjugation'],cat:'conjugation'},
  {q:'dūcō, dūcis, dūcit — what conjugation?',a:'3rd conjugation',opts:['1st conjugation','2nd conjugation','3rd conjugation','4th conjugation'],cat:'conjugation'},
  {q:'audiō, audīs, audit — what conjugation?',a:'4th conjugation',opts:['1st conjugation','2nd conjugation','3rd conjugation','4th conjugation'],cat:'conjugation'},
  {q:'"amāmus" means:',a:'we love',opts:['we love','they love','you (pl.) love','I love'],cat:'conjugation'},
  {q:'"vidēs" means:',a:'you see',opts:['you see','he sees','they see','I see'],cat:'conjugation'},
  {q:'"dūcunt" means:',a:'they lead',opts:['they lead','we lead','he leads','you lead'],cat:'conjugation'},
  {q:'"audīmus" means:',a:'we hear',opts:['we hear','I hear','they hear','you hear'],cat:'conjugation'},
  {q:'"est" is the 3rd person singular of:',a:'esse (to be)',opts:['esse (to be)','īre (to go)','edere (to eat)','ferre (to carry)'],cat:'conjugation'},
  {q:'"sunt" means:',a:'they are',opts:['they are','we are','you are','he/she is'],cat:'conjugation'},
  {q:'"possum" means:',a:'I am able / I can',opts:['I am able / I can','I put','I carry','I want'],cat:'conjugation'},
  {q:'"it" (from īre) means:',a:'he/she goes',opts:['he/she goes','it is','he does','he carries'],cat:'conjugation'},
  {q:'"ferō" means:',a:'I carry / bear',opts:['I carry / bear','I fear','I strike','I am wild'],cat:'conjugation'},
  {q:'"vult" (from velle) means:',a:'he/she wants',opts:['he/she wants','he/she turns','he/she flies','he/she conquers'],cat:'conjugation'},
  {q:'Present infinitive of 1st conj. ends in:',a:'-āre',opts:['-āre','-ēre','-ere','-īre'],cat:'conjugation'},
  {q:'Present infinitive of 2nd conj. ends in:',a:'-ēre',opts:['-āre','-ēre','-ere','-īre'],cat:'conjugation'},
  // ── Noun declension cases ──
  {q:'Nominative case is used for:',a:'subject of sentence',opts:['subject of sentence','direct object','possession','indirect object'],cat:'declension'},
  {q:'Accusative case is used for:',a:'direct object',opts:['direct object','subject','possession','means / instrument'],cat:'declension'},
  {q:'Genitive case is used for:',a:'possession (of)',opts:['possession (of)','direct object','indirect object','subject'],cat:'declension'},
  {q:'Dative case is used for:',a:'indirect object (to/for)',opts:['indirect object (to/for)','direct object','subject','agent'],cat:'declension'},
  {q:'Ablative case is used for:',a:'by / with / from / in',opts:['by / with / from / in','direct object','subject','possession'],cat:'declension'},
  {q:'"puella" is which declension?',a:'1st declension',opts:['1st declension','2nd declension','3rd declension','4th declension'],cat:'declension'},
  {q:'"amīcus" is which declension?',a:'2nd declension',opts:['1st declension','2nd declension','3rd declension','4th declension'],cat:'declension'},
  {q:'"rēx, rēgis" is which declension?',a:'3rd declension',opts:['1st declension','2nd declension','3rd declension','4th declension'],cat:'declension'},
  {q:'1st declension nominative plural ends in:',a:'-ae',opts:['-ae','-ī','-ēs','-a'],cat:'declension'},
  {q:'2nd declension nominative plural (-us) ends in:',a:'-ī',opts:['-ae','-ī','-ēs','-a'],cat:'declension'},
  {q:'"puellam" is in which case?',a:'accusative singular',opts:['accusative singular','nominative singular','genitive singular','ablative singular'],cat:'declension'},
  {q:'"puellārum" is in which case?',a:'genitive plural',opts:['genitive plural','dative plural','ablative plural','accusative plural'],cat:'declension'},
  {q:'"amīcō" could be which case?',a:'dative or ablative singular',opts:['dative or ablative singular','nominative singular','accusative singular','genitive singular'],cat:'declension'},
  {q:'"bellum" (2nd decl. neuter) accusative is:',a:'bellum (same as nom.)',opts:['bellum (same as nom.)','bellī','bellō','bella'],cat:'declension'},
  {q:'Neuter plural nom./acc. always ends in:',a:'-a',opts:['-a','-ī','-ēs','-ae'],cat:'declension'},
  {q:'"rēgem" is in which case?',a:'accusative singular',opts:['accusative singular','nominative singular','ablative singular','genitive singular'],cat:'declension'},
  // ── Grammar concepts ──
  {q:'Latin word order is typically:',a:'SOV (Subject-Object-Verb)',opts:['SOV (Subject-Object-Verb)','SVO (Subject-Verb-Object)','VSO (Verb-Subject-Object)','OSV (Object-Subject-Verb)'],cat:'grammar'},
  {q:'How many noun declensions in Latin?',a:'5',opts:['5','4','3','6'],cat:'grammar'},
  {q:'How many verb conjugations in Latin?',a:'4',opts:['4','3','5','6'],cat:'grammar'},
  {q:'"Puella puerum amat" means:',a:'The girl loves the boy',opts:['The girl loves the boy','The boy loves the girl','The girls love the boy','The boy sees the girl'],cat:'grammar'},
  {q:'"Servus dominum timet" means:',a:'The slave fears the master',opts:['The slave fears the master','The master fears the slave','The slaves fear','The slave is feared'],cat:'grammar'},
  {q:'Which is a perfect tense ending?',a:'-vī',opts:['-vī','-bō','-bam','-ō'],cat:'grammar'},
  {q:'"amāvit" means:',a:'he/she loved (perfect)',opts:['he/she loved (perfect)','he/she loves','he/she will love','he/she was loving'],cat:'grammar'},
  {q:'"-bat" / "-bam" endings indicate:',a:'imperfect tense',opts:['imperfect tense','perfect tense','future tense','present tense'],cat:'grammar'},
  {q:'"amābat" means:',a:'he/she was loving / used to love',opts:['he/she was loving / used to love','he/she loved (once)','he/she will love','he/she loves'],cat:'grammar'},
  {q:'"-bit" / "-bō" endings indicate:',a:'future tense',opts:['future tense','imperfect tense','perfect tense','present tense'],cat:'grammar'},
  {q:'"amābit" means:',a:'he/she will love',opts:['he/she will love','he/she loved','he/she loves','he/she was loving'],cat:'grammar'},
  {q:'The imperative "audī!" means:',a:'Listen! (singular)',opts:['Listen! (singular)','He hears','To hear','They hear'],cat:'grammar'},
  {q:'In "Rōmam eō", why accusative?',a:'motion toward (to Rome)',opts:['motion toward (to Rome)','it is the subject','possession','indirect object'],cat:'grammar'},
  {q:'"Cum amīcīs" means:',a:'with friends',opts:['with friends','of friends','for friends','friends (subject)'],cat:'grammar'},
];

const CAT_ICONS = {
  verb:'🏃',adj:'📐',adverb:'⚡',preposition:'📍',society:'🏙️',emotion:'💖',
  time:'📅',school:'📚',food:'🍽️',phrase:'💬',nature:'🌿',house:'🏠',
  body:'🫀',family:'👨‍👩‍👧‍👦',
  noun:'📜',prep:'📍',conjugation:'🔧',declension:'📊',grammar:'🏛️'
};
const QUIZ_TOTAL = 10, QUIZ_PASS = 8;
let quizQuestions = [], quizCurrent = 0, quizCorrect = 0, quizAnswered = false;
let quizLang = localStorage.getItem('sg_quiz_lang') || 'fr'; // 'fr' or 'la'
let usedFrIndices = [], usedLaVocabIndices = [], usedLaGramIndices = [];

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 겹치지 않게 문제 뽑기 (인덱스 기반) ──
function pickUnused(pool, usedArr, count) {
  if (usedArr.length >= pool.length) usedArr.length = 0; // 다 쓰면 리셋
  const available = [];
  for (let i = 0; i < pool.length; i++) {
    if (!usedArr.includes(i)) available.push(i);
  }
  const shuffled = _shuffle(available);
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  picked.forEach(i => usedArr.push(i));
  return picked.map(i => pool[i]);
}

function setQuizLang(lang) {
  quizLang = lang;
  localStorage.setItem('sg_quiz_lang', lang);
}

function showLangSelector() {
  document.getElementById('quizPanel').classList.add('show');
  document.getElementById('quizResult').style.display = 'none';
  document.getElementById('quizBody').style.display = 'none';
  let sel = document.getElementById('quizLangSelect');
  if (!sel) {
    sel = document.createElement('div');
    sel.id = 'quizLangSelect';
    sel.style.cssText = 'text-align:center;padding:40px 20px;';
    document.querySelector('#quizPanel .quiz-box').appendChild(sel);
  }
  sel.style.display = '';
  sel.innerHTML = `
    <div style="font-size:40px;margin-bottom:16px;">📚</div>
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px;">어떤 과목을 풀래?</div>
    <div style="font-size:13px;color:#888;margin-bottom:24px;">Choose your quiz language</div>
    <button onclick="setQuizLang('fr');startQuiz()" style="display:block;width:100%;padding:16px;margin-bottom:12px;border-radius:14px;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);color:#60a5fa;font-size:18px;font-weight:700;cursor:pointer;">
      🇫🇷 Français (프랑스어)
    </button>
    <button onclick="setQuizLang('la');startQuiz()" style="display:block;width:100%;padding:16px;border-radius:14px;border:2px solid #a855f7;background:rgba(168,85,247,0.1);color:#c084fc;font-size:18px;font-weight:700;cursor:pointer;">
      🏛️ Latina (라틴어)
    </button>`;
}

function startFrenchQuiz() { showLangSelector(); }

function startQuiz() {
  const langSel = document.getElementById('quizLangSelect');
  if (langSel) langSel.style.display = 'none';

  if (quizLang === 'la') {
    // 라틴어: 어휘 6 + 문법 4 섞기
    const vocabPicked = pickUnused(LATIN_VOCAB, usedLaVocabIndices, 6);
    const gramPicked = pickUnused(LATIN_GRAMMAR, usedLaGramIndices, 4);
    const vocabQs = vocabPicked.map(word => {
      const sameCat = LATIN_VOCAB.filter(w => w.cat === word.cat && w.en !== word.en);
      const diffCat = LATIN_VOCAB.filter(w => w.en !== word.en);
      let wrongPool = sameCat.length >= 3 ? _shuffle(sameCat) : _shuffle(diffCat);
      const wrongs = wrongPool.slice(0, 3).map(w => w.en);
      const options = _shuffle([word.en, ...wrongs]);
      return { display: word.la, hint: `${CAT_ICONS[word.cat]||'📖'} ${word.cat} · 뜻을 골라보세요!`, options, answer: word.en, cat: word.cat };
    });
    const gramQs = gramPicked.map(g => ({
      display: g.q, hint: `${CAT_ICONS[g.cat]||'🏛️'} ${g.cat}`, options: _shuffle([...g.opts]), answer: g.a, cat: g.cat, isGrammar: true
    }));
    quizQuestions = _shuffle([...vocabQs, ...gramQs]);
  } else {
    // 프랑스어
    const picked = pickUnused(FRENCH_VOCAB, usedFrIndices, QUIZ_TOTAL);
    quizQuestions = picked.map(word => {
      const sameCat = FRENCH_VOCAB.filter(w => w.cat === word.cat && w.en !== word.en);
      const diffCat = FRENCH_VOCAB.filter(w => w.en !== word.en);
      let wrongPool = sameCat.length >= 3 ? _shuffle(sameCat) : _shuffle(diffCat);
      const wrongs = wrongPool.slice(0, 3).map(w => w.en);
      const options = _shuffle([word.en, ...wrongs]);
      return { display: word.fr, hint: `${CAT_ICONS[word.cat]||'📖'} ${word.cat} · 뜻을 골라보세요!`, options, answer: word.en, cat: word.cat };
    });
  }
  quizCurrent = 0; quizCorrect = 0; quizAnswered = false;
  document.getElementById('quizPanel').classList.add('show');
  document.getElementById('quizResult').style.display = 'none';
  document.getElementById('quizBody').style.display = '';
  renderQuizProgress(); renderQuizQuestion();
}

function renderQuizProgress() {
  let html = '';
  for (let i = 0; i < QUIZ_TOTAL; i++) {
    let cls = '';
    if (i < quizCurrent) cls = quizQuestions[i].wasCorrect ? 'correct' : 'wrong';
    else if (i === quizCurrent) cls = 'current';
    html += `<div class="quiz-dot ${cls}"></div>`;
  }
  document.getElementById('quizProgress').innerHTML = html;
}

function renderQuizQuestion() {
  const q = quizQuestions[quizCurrent];
  const langLabel = quizLang === 'la' ? '🏛️ LATINA' : '🇫🇷 FRANÇAIS';
  document.getElementById('quizNum').textContent = `${langLabel}  문제 ${quizCurrent + 1} / ${QUIZ_TOTAL}`;
  document.getElementById('quizWord').textContent = q.display;
  document.getElementById('quizHint').textContent = q.hint;
  document.getElementById('quizScoreDisplay').textContent = `✅ ${quizCorrect} / ${quizCurrent}`;
  const optDiv = document.getElementById('quizOptions');
  optDiv.innerHTML = q.options.map((opt, i) =>
    `<button class="quiz-option" onclick="selectQuizAnswer(${i})">${opt}</button>`
  ).join('');
  quizAnswered = false;
}

function selectQuizAnswer(idx) {
  if (quizAnswered) return;
  quizAnswered = true;
  const q = quizQuestions[quizCurrent];
  const selected = q.options[idx];
  const correct = selected === q.answer;
  if (correct) quizCorrect++;
  q.wasCorrect = correct;
  const btns = document.querySelectorAll('#quizOptions .quiz-option');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (q.options[i] === q.answer) btn.classList.add('correct');
    if (i === idx && !correct) btn.classList.add('wrong');
  });
  renderQuizProgress();
  document.getElementById('quizScoreDisplay').textContent = `✅ ${quizCorrect} / ${quizCurrent + 1}`;
  setTimeout(() => {
    quizCurrent++;
    if (quizCurrent >= QUIZ_TOTAL) showQuizResult();
    else { renderQuizProgress(); renderQuizQuestion(); }
  }, 1000);
}

function showQuizResult() {
  document.getElementById('quizBody').style.display = 'none';
  const rd = document.getElementById('quizResult');
  rd.style.display = '';
  const passed = quizCorrect >= QUIZ_PASS;
  const pct = Math.round(quizCorrect / QUIZ_TOTAL * 100);
  const langEmoji = quizLang === 'la' ? '🏛️ Optime!' : '🇫🇷 Très bien!';
  if (passed) {
    rd.innerHTML = `<div class="quiz-result-icon">🎉</div>
      <div class="quiz-result-title pass">합격! PASS!</div>
      <div class="quiz-result-score">${quizCorrect}/${QUIZ_TOTAL} (${pct}%)</div>
      <div class="quiz-result-msg">잘했어 연성아! ${langEmoji}<br>10분 더 볼 수 있어!</div>
      <button class="quiz-result-btn unlock" onclick="quizUnlock()">🎮 10분 더!</button>`;
  } else {
    rd.innerHTML = `<div class="quiz-result-icon">😢</div>
      <div class="quiz-result-title fail">아쉽다! Not quite...</div>
      <div class="quiz-result-score">${quizCorrect}/${QUIZ_TOTAL} (${pct}%) — ${QUIZ_PASS}개 필요!</div>
      <div class="quiz-result-msg">다시 도전해보자!<br>조금만 더 공부하면 돼!</div>
      <button class="quiz-result-btn retry" onclick="startFrenchQuiz()">🔄 다시 도전!</button>
      <button class="quiz-result-btn back" onclick="closeQuiz()">🔒 돌아가기</button>`;
  }
}

function quizUnlock() {
  document.getElementById('quizPanel').classList.remove('show');
  if (isDailyLimitReached()) { activateHardLock(); return; }
  screenLocked = false; screenLockTime = null;
  clearInterval(screenLockCountdown); screenLockCountdown = null;
  document.getElementById('screenLockOverlay').classList.remove('show');
  screenStartTime = Date.now();
  clearTimeout(screenAlertTimer);
  sgSave();
  scheduleScreenLock(SCREEN_USE_LIMIT);
  startDailyTracker();
}

function closeQuiz() {
  document.getElementById('quizPanel').classList.remove('show');
}

// ── 화면 타이머 표시 ──
let sgTimerDisplay = null;
let sgTimerInterval = null;

function createTimerDisplay() {
  if (document.getElementById('sgTimerFloat')) {
    sgTimerDisplay = document.getElementById('sgTimerFloat');
    return;
  }
  const div = document.createElement('div');
  div.id = 'sgTimerFloat';
  div.className = 'sg-timer-float';
  div.innerHTML = '<span class="sg-session" id="sgSessionTime">--:--</span>' +
    '<span class="sg-sep"></span>' +
    '<span class="sg-daily" id="sgDailyTime">오늘 --분 남음</span>' +
    '<span class="sg-ver">v16</span>';
  document.body.appendChild(div);
  sgTimerDisplay = div;
}

function updateTimerDisplay() {
  if (!sgTimerDisplay) return;
  if (screenLocked || dailyHardLocked) {
    sgTimerDisplay.style.display = 'none';
    return;
  }
  sgTimerDisplay.style.display = '';

  // 세션 남은 시간
  const sessionElapsed = Date.now() - screenStartTime;
  const sessionRemain = Math.max(0, SCREEN_USE_LIMIT - sessionElapsed);
  const sMin = Math.floor(sessionRemain / 60000);
  const sSec = Math.floor((sessionRemain % 60000) / 1000);
  const sessionEl = document.getElementById('sgSessionTime');
  if (sessionEl) sessionEl.textContent = sMin + ':' + (sSec < 10 ? '0' : '') + sSec;

  // 하루 남은 시간
  const dailyRemain = Math.max(0, dailyAllowed - dailyUsed);
  const dMin = Math.round(dailyRemain / 60000);
  const dailyEl = document.getElementById('sgDailyTime');
  if (dailyEl) dailyEl.textContent = '오늘 ' + dMin + '분 남음';

  // 색상 변경
  sgTimerDisplay.classList.remove('warn', 'critical');
  if (sessionRemain < 60000) sgTimerDisplay.classList.add('critical');
  else if (sessionRemain < 3 * 60000) sgTimerDisplay.classList.add('warn');
}

function startTimerDisplay() {
  createTimerDisplay();
  updateTimerDisplay();
  clearInterval(sgTimerInterval);
  sgTimerInterval = setInterval(updateTimerDisplay, 1000);
}

// Init: load state and start
function initScreenGuard() {
  sgLoad();
  startTimerDisplay();
  if (dailyHardLocked) return;
  if (!screenLocked && !screenAlertTimer) {
    if (isDailyLimitReached()) { activateHardLock(); return; }
    const elapsed = Date.now() - screenStartTime;
    if (elapsed < SCREEN_USE_LIMIT) {
      scheduleScreenLock(SCREEN_USE_LIMIT - elapsed);
    } else {
      activateLock();
    }
  }
  if (!screenLocked) startDailyTracker();
}
