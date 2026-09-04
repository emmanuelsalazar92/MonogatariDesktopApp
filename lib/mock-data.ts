import { BookOpen, Boxes, FileText, Map } from "lucide-react";
import type {
  Character,
  Chapter,
  Location,
  Note,
  Novel,
  Relationship,
  Scene,
  TimelineEvent,
  Volume
} from "@/lib/studio-domain";

export type {
  ChapterStatus,
  FocusMode,
  Note as StoryNote,
  NovelStatus,
  PageId,
  SidebarState
} from "@/lib/studio-domain";

export {
  exportFormats,
  exportScopes,
  genreFilters,
  navigationItems,
  placeTypes,
  shortcutHints,
  statusFilters
} from "@/lib/studio-domain";

export const novels: Novel[] = [
  {
    id: "novel-eco-azul",
    title: "La Academia del Eco Azul",
    synopsis:
      "Akira Moriyama llega a una academia aislada donde las campanas repiten voces del pasado y una torre sellada despierta cada medianoche.",
    status: "Writing",
    coverImage: "",
    genre: "Light Novel / Fantasy / School Mystery",
    tags: ["fantasy", "school", "mystery", "romance"],
    wordCount: 84260,
    createdAt: "2026-04-12",
    updatedAt: "2026-06-28"
  },
  {
    id: "novel-cristal",
    title: "El Archivo de Cristal",
    synopsis:
      "Una aprendiz de bibliotecaria descubre que algunos libros recuerdan versiones alternativas de sus lectores.",
    status: "Planning",
    coverImage: "",
    genre: "Fantasy / Mystery",
    tags: ["library", "magic", "quiet"],
    wordCount: 18400,
    createdAt: "2026-05-04",
    updatedAt: "2026-06-24"
  },
  {
    id: "novel-sombras",
    title: "Sombras Bajo la Lluvia",
    synopsis:
      "Un club escolar investiga desapariciones conectadas con una estaciÃ³n abandonada que solo aparece cuando llueve.",
    status: "Revision",
    coverImage: "",
    genre: "School Mystery / Supernatural",
    tags: ["rain", "school", "supernatural"],
    wordCount: 53620,
    createdAt: "2026-02-18",
    updatedAt: "2026-06-20"
  },
  {
    id: "novel-lirio",
    title: "El Lirio del Reino Norte",
    synopsis:
      "Una princesa exiliada negocia con espÃ­ritus de nieve para recuperar un trono que tal vez nunca quiso.",
    status: "Idea",
    coverImage: "",
    genre: "Fantasy / Court Drama",
    tags: ["kingdom", "snow", "politics"],
    wordCount: 6200,
    createdAt: "2026-06-01",
    updatedAt: "2026-06-18"
  }
];

export const volumes: Volume[] = [
  {
    id: "vol-1",
    novelId: "novel-eco-azul",
    title: "Volume 1: El eco detrÃ¡s de la puerta",
    sortOrder: 1,
    archived: false,
    summary:
      "Akira entra a la Academia Seiryu y conoce a Reina, la Ãºnica estudiante que parece escuchar la voz de la torre."
  },
  {
    id: "vol-2",
    novelId: "novel-eco-azul",
    title: "Volume 2: Las campanas de medianoche",
    sortOrder: 2,
    archived: false,
    summary:
      "La investigaciÃ³n se acerca al origen del sÃ­mbolo prohibido y a la familia Tsukishiro."
  },
  {
    id: "vol-extra",
    novelId: "novel-eco-azul",
    title: "Extras",
    sortOrder: 3,
    archived: false,
    summary: "Interludios, perfiles y escenas alternativas."
  }
];

export const chapters: Chapter[] = [
  {
    id: "ch-prologue",
    volumeId: "vol-1",
    title: "Prologue",
    summary: "Una voz llama desde la Torre Sellada.",
    status: "Ready",
    sortOrder: 1,
    wordCount: 3200,
    archived: false
  },
  {
    id: "ch-1",
    volumeId: "vol-1",
    title: "Chapter 1: La puerta que no debÃ­a abrirse",
    summary: "Akira llega a Seiryu y rompe su primera regla.",
    status: "Writing",
    sortOrder: 2,
    wordCount: 7400,
    archived: false
  },
  {
    id: "ch-2",
    volumeId: "vol-1",
    title: "Chapter 2: El mapa invisible",
    summary: "Mika reconoce un patrÃ³n oculto en el mapa del campus.",
    status: "Draft",
    sortOrder: 3,
    wordCount: 6900,
    archived: false
  },
  {
    id: "ch-interlude",
    volumeId: "vol-1",
    title: "Interlude: La campana azul",
    summary: "Reina escribe una carta que no piensa enviar.",
    status: "Idea",
    sortOrder: 4,
    wordCount: 1250,
    archived: false
  },
  {
    id: "ch-epilogue",
    volumeId: "vol-1",
    title: "Epilogue",
    summary: "El sÃ­mbolo aparece en la ventana del dormitorio.",
    status: "Draft",
    sortOrder: 5,
    wordCount: 2100,
    archived: false
  },
  {
    id: "ch-v2-1",
    volumeId: "vol-2",
    title: "Chapter 1: Archivo subterrÃ¡neo",
    summary: "Kuroda muestra una verdad incompleta.",
    status: "Idea",
    sortOrder: 1,
    wordCount: 800,
    archived: false
  }
];

export const scenes: Scene[] = [
  {
    id: "scene-1",
    chapterId: "ch-1",
    title: "Scene 1: Llegada a la Academia Seiryu",
    content:
      "â€”No debiste abrir esa puerta â€”dijo Reina.\nYo, por supuesto, abrÃ­ la puerta.\n\nLa bisagra respondiÃ³ con un gemido tan antiguo que por un instante pensÃ© que toda la Academia Seiryu habÃ­a contenido la respiraciÃ³n. DetrÃ¡s no habÃ­a un aula vacÃ­a, ni un pasillo cubierto de polvo, sino una escalera de piedra iluminada por una luz azul que no venÃ­a de ninguna lÃ¡mpara.\n\nReina Tsukishiro me tomÃ³ de la manga. Sus dedos estaban frÃ­os.\n\nâ€”Akira, si bajas, la torre recordarÃ¡ tu nombre.\n\nEn una escuela normal, aquella frase habrÃ­a bastado para llamar a un profesor. En Seiryu, solo logrÃ³ que mi corazÃ³n se adelantara un paso antes que yo.",
    summary: "Akira abre una puerta prohibida junto a Reina.",
    status: "Writing",
    locationId: "place-torre",
    sortOrder: 1,
    wordCount: 510,
    objective: "Presentar la curiosidad de Akira y la advertencia de Reina.",
    revision: 0,
    archived: false
  },
  {
    id: "scene-2",
    chapterId: "ch-1",
    title: "Scene 2: La advertencia de Reina",
    content:
      "Reina no gritÃ³ cuando la campana sonÃ³ bajo nuestros pies. Eso fue lo primero que me inquietÃ³. Lo segundo fue que la campana pronunciÃ³ mi apellido con la voz de mi hermana.",
    summary: "La torre imita una voz familiar.",
    status: "Draft",
    locationId: "place-torre",
    sortOrder: 2,
    wordCount: 620,
    objective: "Vincular a Mika con el misterio central.",
    revision: 0,
    archived: false
  },
  {
    id: "scene-3",
    chapterId: "ch-2",
    title: "Scene 1: El mapa invisible",
    content:
      "Mika extendiÃ³ el mapa sobre el escritorio y colocÃ³ cuatro monedas en las esquinas. La tinta invisible apareciÃ³ como si la pÃ¡gina hubiera decidido recordar.",
    summary: "Mika encuentra rutas ocultas bajo el campus.",
    status: "Idea",
    locationId: "place-biblioteca",
    sortOrder: 1,
    wordCount: 430,
    objective: "Dar una herramienta concreta al grupo.",
    revision: 0,
    archived: false
  }
];

export const characters: Character[] = [
  {
    id: "char-akira",
    novelId: "novel-eco-azul",
    name: "Akira Moriyama",
    alias: "El chico de la puerta",
    aliases: ["El chico de la puerta"],
    age: "16",
    role: "Protagonist",
    appearance: "Cabello negro desordenado, uniforme usado con poca disciplina.",
    personality: "Curioso, impulsivo y leal cuando entiende el peligro.",
    wayOfSpeaking: "Directo, con humor seco cuando estÃ¡ nervioso.",
    goal: "Descubrir por quÃ© la torre conoce su apellido.",
    fear: "Que Mika pague el precio de sus decisiones.",
    secret: "EscuchÃ³ la campana azul antes de llegar a Seiryu.",
    notes: "Su curiosidad debe causar problemas, pero tambiÃ©n resolverlos.",
    firstAppearance: "Volume 1: El eco detrás de la puerta · Chapter 1: La puerta que no debía abrirse · 01 — Scene 1: Llegada a la Academia Seiryu",
    firstAppearanceOrder: 0,
    status: "Active",
    narrativeStatus: "",
    image: "",
    updatedAt: "2026-06-28T10:00:00.000Z",
    archivedAt: null,
    scenes: 18
  },
  {
    id: "char-reina",
    novelId: "novel-eco-azul",
    name: "Reina Tsukishiro",
    alias: "Guardiana de la llave azul",
    aliases: ["Guardiana de la llave azul"],
    age: "16",
    role: "Support",
    appearance: "Cabello plateado, mirada serena, cinta azul en la muÃ±eca.",
    personality: "Reservada, precisa y protectora con quien gana su confianza.",
    wayOfSpeaking: "Formal, breve, con pausas calculadas.",
    goal: "Mantener sellada la torre sin repetir el error de su familia.",
    fear: "Convertirse en la siguiente voz atrapada en la campana.",
    secret: "Puede leer sÃ­mbolos que no existen para otros estudiantes.",
    notes: "Romance lento con Akira, siempre desde tensiÃ³n de confianza.",
    firstAppearance: "Volume 1: El eco detrás de la puerta · Chapter 1: La puerta que no debía abrirse · 01 — Scene 1: Llegada a la Academia Seiryu",
    firstAppearanceOrder: 0,
    status: "Active",
    narrativeStatus: "",
    image: "",
    updatedAt: "2026-06-27T10:00:00.000Z",
    archivedAt: null,
    scenes: 16
  },
  {
    id: "char-mika",
    novelId: "novel-eco-azul",
    name: "Mika Moriyama",
    alias: "CartÃ³grafa accidental",
    aliases: ["CartÃ³grafa accidental"],
    age: "15",
    role: "Support",
    appearance: "Trenzas cortas, lentes redondos, mochila llena de notas.",
    personality: "Observadora, metÃ³dica y mÃ¡s valiente de lo que admite.",
    wayOfSpeaking: "RÃ¡pida, llena de preguntas y correcciones.",
    goal: "Proteger a Akira usando lÃ³gica donde Ã©l usa impulso.",
    fear: "Ser invisible para las personas que quiere ayudar.",
    secret: "El mapa de Seiryu cambia cuando ella lo toca.",
    notes: "Funciona como brÃºjula emocional y lÃ³gica del equipo.",
    firstAppearance: "Volume 1: El eco detrás de la puerta · Chapter 2: El mapa invisible · 01 — Scene 1: El mapa invisible",
    firstAppearanceOrder: 1,
    status: "Active",
    narrativeStatus: "Secondary",
    image: "",
    updatedAt: "2026-06-26T10:00:00.000Z",
    archivedAt: null,
    scenes: 9
  },
  {
    id: "char-kuroda",
    novelId: "novel-eco-azul",
    name: "Professor Kuroda",
    alias: "Archivist of sealed rooms",
    aliases: ["Archivist of sealed rooms"],
    age: "42",
    role: "Other",
    appearance: "Abrigo oscuro, guantes de cuero, siempre lleva tiza azul.",
    personality: "Calmo, evasivo, amable solo cuando le conviene.",
    wayOfSpeaking: "AcadÃ©mico, con frases que parecen advertencias.",
    goal: "Administrar el secreto de la academia hasta elegir heredero.",
    fear: "Que los estudiantes descubran quÃ© ocurriÃ³ hace diez aÃ±os.",
    secret: "Ã‰l cerrÃ³ la Torre Sellada la Ãºltima vez.",
    notes: "Debe sentirse Ãºtil y peligroso en la misma escena.",
    firstAppearance: "",
    firstAppearanceOrder: null,
    status: "Active",
    narrativeStatus: "Spoiler",
    image: "",
    updatedAt: "2026-06-25T10:00:00.000Z",
    archivedAt: null,
    scenes: 11
  }
];

export const locations: Location[] = [
  {
    id: "place-academia",
    status: "active", atmosphere: "", parentPlaceId: null, revision: 0,
    novelId: "novel-eco-azul",
    name: "Academia Seiryu",
    type: "building",
    region: "MontaÃ±as del norte",
    description:
      "Internado antiguo rodeado por niebla, con aulas de madera clara y corredores que cambian levemente despuÃ©s de medianoche.",
    importance: "Escenario principal y contenedor del misterio.",
    visualNotes: "Campanarios azules, patios de piedra, lÃ¡mparas cÃ¡lidas.",
    rules: "NingÃºn estudiante puede entrar a la Torre Sellada.",
    firstAppearance: "Prologue",
    notes: "La escuela debe sentirse acogedora durante el dÃ­a e inquietante de noche."
  },
  {
    id: "place-biblioteca",
    status: "active", atmosphere: "", parentPlaceId: null, revision: 0,
    novelId: "novel-eco-azul",
    name: "Biblioteca Antigua",
    type: "building",
    region: "Ala oeste",
    description:
      "Biblioteca circular con estantes mÃ³viles y un catÃ¡logo escrito en tinta que aparece bajo luz azul.",
    importance: "Centro de investigaciÃ³n del equipo.",
    visualNotes: "Madera oscura, polvo dorado, vitrales con sÃ­mbolos.",
    rules: "Los libros prestados regresan solos si se revela un secreto.",
    firstAppearance: "Chapter 2",
    notes: "Buen lugar para conversaciones Ã­ntimas y descubrimientos."
  },
  {
    id: "place-torre",
    status: "active", atmosphere: "", parentPlaceId: null, revision: 0,
    novelId: "novel-eco-azul",
    name: "Torre Sellada",
    type: "other",
    region: "Patio norte",
    description:
      "Torre sin puerta visible desde afuera. Por dentro contiene escaleras imposibles y ecos de voces familiares.",
    importance: "Misterio central.",
    visualNotes: "Piedra frÃ­a, luz azul, marcas de campana en las paredes.",
    rules: "La torre recuerda el nombre de quien baja al tercer descanso.",
    firstAppearance: "Chapter 1",
    notes: "Usar con moderaciÃ³n para conservar tensiÃ³n."
  },
  {
    id: "place-dormitorio",
    status: "active", atmosphere: "", parentPlaceId: null, revision: 0,
    novelId: "novel-eco-azul",
    name: "Dormitorio Este",
    type: "building",
    region: "Ala este",
    description:
      "Residencia estudiantil luminosa, con cocineta comÃºn y ventanas hacia el bosque.",
    importance: "Lugar de descanso y planificaciÃ³n.",
    visualNotes: "Edredones beige, escritorios estrechos, notas pegadas.",
    rules: "Las ventanas deben cerrarse antes de la Ãºltima campana.",
    firstAppearance: "Chapter 1",
    notes: "Contraste cÃ¡lido frente a la torre."
  }
];

export const relationships: Relationship[] = [
  {
    id: "rel-akira-reina",
    novelId: "novel-eco-azul",
    fromCharacterId: "char-akira",
    toCharacterId: "char-reina",
    relationshipType: "is in love with",
    category: "Romance",
    direction: "Directional",
    description: "Akira is drawn to Reina's courage before he understands her burden.",
    isSpoiler: false,
    status: "Growing",
    since: "Chapter 1",
    notes: "Keep it subtle through shared danger and quiet trust.",
    labelFromTo: "is in love with",
    labelToFrom: "is loved by"
  },
  {
    id: "rel-mika-akira",
    novelId: "novel-eco-azul",
    fromCharacterId: "char-mika",
    toCharacterId: "char-akira",
    relationshipType: "cousin of",
    category: "Family",
    direction: "Bidirectional",
    description: "Mika is Akira's younger cousin and his most reliable critic.",
    isSpoiler: false,
    status: "Stable",
    since: "Before story",
    notes: "Their banter should feel lived in.",
    labelFromTo: "cousin of",
    labelToFrom: "cousin of"
  },
  {
    id: "rel-reina-kuroda",
    novelId: "novel-eco-azul",
    fromCharacterId: "char-reina",
    toCharacterId: "char-kuroda",
    relationshipType: "distrusts",
    category: "Conflict",
    direction: "Directional",
    description: "Reina believes Kuroda knows more about her family than he admits.",
    isSpoiler: true,
    status: "Tense",
    since: "Prologue",
    notes: "Let Kuroda be helpful enough to complicate Reina's certainty.",
    labelFromTo: "distrusts",
    labelToFrom: "is distrusted by"
  }
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "event-1",
    sortIndex: 1024, chronologyKind: "manual", relativeDay: null, relativeMinute: null, positionRevision: 0,
    novelId: "novel-eco-azul",
    title: "Akira arrives at the academy.",
    internalDate: "Day 1",
    volumeId: "vol-1",
    chapterId: "ch-1",
    sceneId: "scene-1",
    locationIds: ["place-academia"],
    characterIds: ["char-akira"],
    description: "Akira reaches Seiryu just before the evening bell.",
    isSpoiler: false
  },
  {
    id: "event-2",
    sortIndex: 2048, chronologyKind: "manual", relativeDay: null, relativeMinute: null, positionRevision: 0,
    novelId: "novel-eco-azul",
    title: "Akira meets Reina.",
    internalDate: "Day 1",
    volumeId: "vol-1",
    chapterId: "ch-1",
    sceneId: "scene-1",
    locationIds: ["place-torre"],
    characterIds: ["char-akira", "char-reina"],
    description: "Reina catches Akira near the forbidden door.",
    isSpoiler: false
  },
  {
    id: "event-3",
    sortIndex: 3072, chronologyKind: "manual", relativeDay: null, relativeMinute: null, positionRevision: 0,
    novelId: "novel-eco-azul",
    title: "Reina notices the forbidden symbol.",
    internalDate: "Day 1",
    volumeId: "vol-1",
    chapterId: "ch-1",
    sceneId: "scene-2",
    locationIds: ["place-torre"],
    characterIds: ["char-reina", "char-akira"],
    description: "A blue sigil appears near the stairs after Akira opens the door.",
    isSpoiler: true
  }
];

export const notes: Note[] = [
  {
    id: "note-1",
    novelId: "novel-eco-azul",
    linkedType: "Novel",
    linkedId: "novel-eco-azul",
    title: "Core emotional promise",
    content:
      "Every mystery scene should also test whether Akira and Reina trust each other one step more.",
    tags: ["mystery", "romance", "use-later"],
    updatedAt: "2026-06-28"
  },
  {
    id: "note-2",
    novelId: "novel-eco-azul",
    linkedType: "Character",
    linkedId: "char-kuroda",
    title: "Kuroda reveal pacing",
    content:
      "He should answer questions truthfully but incompletely. Avoid making him a simple villain.",
    tags: ["spoiler", "volume-2"],
    updatedAt: "2026-06-25"
  },
  {
    id: "note-3",
    novelId: "novel-eco-azul",
    linkedType: "Scene",
    linkedId: "scene-1",
    title: "Door scene rhythm",
    content:
      "Keep the opening short, funny, and ominous. The first two lines carry the tone.",
    tags: ["comedy", "mystery"],
    updatedAt: "2026-06-27"
  },
  {
    id: "note-4",
    novelId: "novel-eco-azul",
    linkedType: "Place",
    linkedId: "place-biblioteca",
    title: "Library visual motif",
    content:
      "Dust should look like floating gold when Reina uses the key. Good image for chapter break.",
    tags: ["visual", "use-later"],
    updatedAt: "2026-06-22"
  }
];

export const backupExamples = [
  {
    name: "backup-2026-06-28.zip",
    date: "2026-06-28",
    size: "48.6 MB",
    includedNovels: 4,
    status: "Complete"
  },
  {
    name: "backup-2026-06-27.zip",
    date: "2026-06-27",
    size: "47.9 MB",
    includedNovels: 4,
    status: "Complete"
  },
  {
    name: "backup-2026-06-26.zip",
    date: "2026-06-26",
    size: "47.1 MB",
    includedNovels: 4,
    status: "Complete"
  }
];

export const statCards = [
  { label: "Total words", value: "162,480", icon: FileText },
  { label: "Chapters", value: "42", icon: BookOpen },
  { label: "Scenes", value: "118", icon: Boxes },
  { label: "Places", value: "24", icon: Map }
];

