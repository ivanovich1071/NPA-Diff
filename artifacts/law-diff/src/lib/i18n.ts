import { create } from 'zustand';

export type Language = 'ru' | 'be';

interface I18nStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.ru) => string;
}

const translations = {
  ru: {
    appTitle: 'NPA.Diff',
    appSubtitle: 'Сравнение редакций нормативных правовых актов',
    navNew: 'Новое сравнение',
    navHistory: 'История',
    navSettings: 'Настройки',
    langRu: 'Русский',
    langBe: 'Беларуская',
    
    // Upload page
    startComparison: 'Начать сравнение',
    comparisonTitle: 'Название сравнения',
    comparisonTitlePlaceholder: 'Например: Закон о хозяйственных обществах (ред. от 01.01.2023 и 01.06.2024)',
    uploadOldVersion: 'Старая редакция',
    uploadNewVersion: 'Новая редакция',
    inputMethodFile: 'Файл (DOCX, PDF, TXT)',
    inputMethodText: 'Текст',
    inputMethodUrl: 'Ссылка pravo.by / etalonline.by',
    pasteTextPlaceholder: 'Вставьте текст документа...',
    urlPlaceholder: 'https://pravo.by/document/?guid=... или https://etalonline.by/...',
    buttonSelectFile: 'Выбрать файл',
    buttonCompare: 'Сравнить документы',
    processing: 'Анализ и сравнение...',

    // Results page
    summaryTitle: 'Резюме изменений',
    aiSummary: 'Анализ сути изменений (AI)',
    changesTable: 'Сводка изменений',
    article: 'Статья/Пункт',
    changeType: 'Тип изменения',
    oldText: 'Было',
    newText: 'Стало',
    
    // Change types
    typeAddition: 'Добавление',
    typeDeletion: 'Удаление',
    typeReplacement: 'Изменение',
    typeMove: 'Перемещение',

    // Toolbar
    viewOnlyChanges: 'Только изменения',
    viewFullText: 'Полный текст',
    exportReport: 'Экспорт отчета',
    
    // Review
    reviewBlockTitle: 'Экспертная оценка',
    approveBtn: 'Утвердить',
    rejectBtn: 'Отклонить',
    reviewerNote: 'Заметка эксперта',
    reviewerNotePlaceholder: 'Укажите важные юридические риски или замечания по изменениям...',
    statusApproved: 'Утверждено',
    statusRejected: 'Отклонено',
    statusPending: 'Ожидает проверки',

    // Chat
    chatTitle: 'Ассистент',
    chatPlaceholder: 'Задайте вопрос по изменениям в документе...',
    chatSend: 'Отправить',
    chatEmpty: 'Здесь вы можете задать вопросы по изменениям в этом НПА. Ассистент проанализирует обе редакции и даст развернутый ответ.',

    // History
    historyTitle: 'История сравнений',
    historyEmpty: 'История сравнений пуста',
    colTitle: 'Название',
    colDate: 'Дата',
    colStatus: 'Статус',
    colChanges: 'Изменений',
    colAction: 'Действие',
    openComparison: 'Открыть',
    deleteComparison: 'Удалить',
    
    // Errors
    errorRequired: 'Обязательное поле',
    errorUpload: 'Ошибка загрузки',
    errorCompare: 'Ошибка при сравнении'
  },
  be: {
    appTitle: 'НПА.Diff',
    appSubtitle: 'Параўнанне рэдакцый нарматыўных прававых актаў',
    navNew: 'Новае параўнанне',
    navHistory: 'Гісторыя',
    navSettings: 'Налады',
    langRu: 'Русский',
    langBe: 'Беларуская',
    
    // Upload page
    startComparison: 'Пачаць параўнанне',
    comparisonTitle: 'Назва параўнання',
    comparisonTitlePlaceholder: 'Напрыклад: Закон аб гаспадарчых таварыствах...',
    uploadOldVersion: 'Старая рэдакцыя',
    uploadNewVersion: 'Новая рэдакцыя',
    inputMethodFile: 'Файл (DOCX, PDF, TXT)',
    inputMethodText: 'Тэкст',
    inputMethodUrl: 'Спасылка pravo.by / etalonline.by',
    pasteTextPlaceholder: 'Устаўце тэкст дакумента...',
    urlPlaceholder: 'https://pravo.by/document/?guid=... або https://etalonline.by/...',
    buttonSelectFile: 'Выбраць файл',
    buttonCompare: 'Параўнаць дакументы',
    processing: 'Аналіз і параўнанне...',

    // Results page
    summaryTitle: 'Рэзюмэ змяненняў',
    aiSummary: 'Аналіз сутнасці змяненняў (AI)',
    changesTable: 'Зводка змяненняў',
    article: 'Артыкул/Пункт',
    changeType: 'Тып змянення',
    oldText: 'Было',
    newText: 'Стала',
    
    // Change types
    typeAddition: 'Даданне',
    typeDeletion: 'Выдаленне',
    typeReplacement: 'Змяненне',
    typeMove: 'Перамяшчэнне',

    // Toolbar
    viewOnlyChanges: 'Толькі змяненні',
    viewFullText: 'Поўны тэкст',
    exportReport: 'Экспарт справаздачы',
    
    // Review
    reviewBlockTitle: 'Экспертная ацэнка',
    approveBtn: 'Зацвердзіць',
    rejectBtn: 'Адхіліць',
    reviewerNote: 'Заўвага эксперта',
    reviewerNotePlaceholder: 'Укажыце важныя юрыдычныя рызыкі...',
    statusApproved: 'Зацверджана',
    statusRejected: 'Адхілена',
    statusPending: 'Чакае праверкі',

    // Chat
    chatTitle: 'Асістэнт',
    chatPlaceholder: 'Задайце пытанне па змяненнях...',
    chatSend: 'Адправіць',
    chatEmpty: 'Тут вы можаце задаць пытанні па змяненнях у гэтым НПА.',

    // History
    historyTitle: 'Гісторыя параўнанняў',
    historyEmpty: 'Гісторыя параўнанняў пустая',
    colTitle: 'Назва',
    colDate: 'Дата',
    colStatus: 'Статус',
    colChanges: 'Змяненняў',
    colAction: 'Дзеянне',
    openComparison: 'Адкрыць',
    deleteComparison: 'Выдаліць',
    
    // Errors
    errorRequired: 'Абавязковае поле',
    errorUpload: 'Памылка загрузкі',
    errorCompare: 'Памылка пры параўнанні'
  }
};

export const useI18n = create<I18nStore>((set, get) => ({
  language: 'ru',
  setLanguage: (lang: Language) => set({ language: lang }),
  t: (key) => translations[get().language][key] || translations['ru'][key] || key
}));
