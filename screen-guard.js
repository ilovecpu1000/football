// ===== SCREEN TIME GUARDIAN (shared across all pages) =====
// sessionStorage로 페이지간 시간 공유, localStorage로 설정값 저장
const SCREEN_DEFAULT_MINUTES = 10;
const SCREEN_LOCK_DURATION = 60 * 60 * 1000;
const SCREEN_LOCK_PIN = '7479';

// localStorage에서 설정값 로드 (하루 지나면 디폴트로 리셋)
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

let screenStartTime = Date.now();
let screenAlertTimer = null;
let screenLocked = false;
let screenLockTime = null;
let screenLockCountdown = null;

// sessionStorage sync
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
    const raw = sessionStorage.getItem('sg_data');
    if (!raw) return;
    const d = JSON.parse(raw);
    screenStartTime = d.start || Date.now();
    if (d.locked && d.lockTime) {
      const elapsed = Date.now() - d.lockTime;
      if (elapsed < SCREEN_LOCK_DURATION) {
        screenLocked = true;
        screenLockTime = d.lockTime;
        setTimeout(() => activateLock(), 50);
        return;
      } else {
        sessionStorage.removeItem('sg_data');
        return;
      }
    }
    // 남은 시간 계산 → 바로 잠금
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
  clearTimeout(screenAlertTimer);
  screenStartTime = Date.now();
  sgSave();
  scheduleScreenLock(SCREEN_USE_LIMIT);
}

function scheduleScreenLock(delay) {
  if (screenLocked) return;
  clearTimeout(screenAlertTimer);
  screenAlertTimer = setTimeout(() => activateLock(), delay);
}

function activateLock() {
  screenLocked = true;
  screenLockTime = screenLockTime || Date.now();
  clearTimeout(screenAlertTimer);
  sgSave();
  document.getElementById('screenLockInput').value = '';
  document.getElementById('screenLockError').textContent = '';
  document.getElementById('screenLockOverlay').classList.add('show');
  updateLockCountdown();
  clearInterval(screenLockCountdown);
  screenLockCountdown = setInterval(updateLockCountdown, 1000);
  // 바로 프랑스어 퀴즈 시작
  setTimeout(() => startFrenchQuiz(), 300);
}

function updateLockCountdown() {
  const elapsed = Date.now() - screenLockTime;
  const remaining = SCREEN_LOCK_DURATION - elapsed;
  if (remaining <= 0) { doUnlock(); return; }
  const min = Math.floor(remaining / 60000);
  const sec = Math.floor((remaining % 60000) / 1000);
  document.getElementById('screenLockSub').innerHTML =
    `아빠한테 말해서 풀어달라고 해<br>⏱️ 자동 해제까지 <b>${min}분 ${sec < 10 ? '0' : ''}${sec}초</b>`;
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

function unlockScreen() {
  const input = document.getElementById('screenLockInput');
  const error = document.getElementById('screenLockError');
  if (input.value === SCREEN_LOCK_PIN) {
    doUnlock();
  } else {
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
  if (screenLocked) {
    if (!document.hidden) updateLockCountdown();
    return;
  }
  if (document.hidden) {
    clearTimeout(screenAlertTimer);
  } else {
    sgLoad(); // 다른 페이지에서 변경된 상태 로드
  }
});

// 페이지 떠날 때 상태 저장
window.addEventListener('beforeunload', sgSave);
window.addEventListener('pagehide', sgSave);

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

const CAT_ICONS = {
  verb:'🏃',adj:'📐',adverb:'⚡',preposition:'📍',society:'🏙️',emotion:'💖',
  time:'📅',school:'📚',food:'🍽️',phrase:'💬',nature:'🌿',house:'🏠',
  body:'🫀',family:'👨‍👩‍👧‍👦'
};
const QUIZ_TOTAL = 10, QUIZ_PASS = 8;
let quizQuestions = [], quizCurrent = 0, quizCorrect = 0, quizAnswered = false;

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startFrenchQuiz() {
  const pool = _shuffle(FRENCH_VOCAB);
  quizQuestions = pool.slice(0, QUIZ_TOTAL).map(word => {
    const sameCat = FRENCH_VOCAB.filter(w => w.cat === word.cat && w.en !== word.en);
    const diffCat = FRENCH_VOCAB.filter(w => w.en !== word.en);
    let wrongPool = sameCat.length >= 3 ? _shuffle(sameCat) : _shuffle(diffCat);
    const wrongs = wrongPool.slice(0, 3).map(w => w.en);
    const options = _shuffle([word.en, ...wrongs]);
    return { ...word, options, answer: word.en };
  });
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
  const icon = CAT_ICONS[q.cat] || '📖';
  document.getElementById('quizNum').textContent = `문제 ${quizCurrent + 1} / ${QUIZ_TOTAL}`;
  document.getElementById('quizWord').textContent = q.fr;
  document.getElementById('quizHint').textContent = `${icon} ${q.cat} · 뜻을 골라보세요!`;
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
  if (passed) {
    rd.innerHTML = `<div class="quiz-result-icon">🎉</div>
      <div class="quiz-result-title pass">합격! PASS!</div>
      <div class="quiz-result-score">${quizCorrect}/${QUIZ_TOTAL} (${pct}%)</div>
      <div class="quiz-result-msg">잘했어 연성아! 🇫🇷 Très bien!<br>10분 더 볼 수 있어!</div>
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
  screenLocked = false; screenLockTime = null;
  clearInterval(screenLockCountdown); screenLockCountdown = null;
  document.getElementById('screenLockOverlay').classList.remove('show');
  screenStartTime = Date.now();
  clearTimeout(screenAlertTimer);
  sgSave();
  scheduleScreenLock(SCREEN_USE_LIMIT);
}

function closeQuiz() {
  document.getElementById('quizPanel').classList.remove('show');
}

// Init: load state and start
function initScreenGuard() {
  sgLoad();
  if (!screenLocked && !screenAlertTimer) {
    const elapsed = Date.now() - screenStartTime;
    if (elapsed < SCREEN_USE_LIMIT) {
      scheduleScreenLock(SCREEN_USE_LIMIT - elapsed);
    } else {
      activateLock();
    }
  }
}
