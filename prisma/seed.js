let prisma;

const toDate = (value) => new Date(`${value}T00:00:00.000Z`);
const json = (value) => JSON.stringify(value);

async function main() {
  const { join } = await import("node:path");
  const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
  const { default: createJiti } = await import("jiti");
  const jiti = createJiti(__filename);
  const { getRelationshipDefinition, canonicalRelationship } = jiti(join(process.cwd(), "lib", "character-relationship.ts"));
  const { PrismaClient } = jiti(
    join(process.cwd(), "lib", "generated", "prisma", "client.ts")
  );

  const adapter = new PrismaBetterSqlite3({
    url: join(process.cwd(), "prisma", "dev.db")
  });

  prisma = new PrismaClient({ adapter });

  await prisma.$transaction([
    prisma.appSetting.deleteMany(),
    prisma.backup.deleteMany(),
    prisma.studioConfiguration.deleteMany(),
    prisma.note.deleteMany(),
    prisma.timelineEvent.deleteMany(),
    prisma.relationship.deleteMany(),
    prisma.scene.deleteMany(),
    prisma.chapter.deleteMany(),
    prisma.volume.deleteMany(),
    prisma.location.deleteMany(),
    prisma.character.deleteMany(),
    prisma.novel.deleteMany()
  ]);

  await prisma.novel.createMany({
    data: [
      {
        id: "novel-eco-azul",
        title: "La Academia del Eco Azul",
        synopsis:
          "Akira Moriyama llega a una academia aislada donde las campanas repiten voces del pasado y una torre sellada despierta cada medianoche.",
        status: "Writing",
        genre: "Light Novel / Fantasy / School Mystery",
        tags: json(["fantasy", "school", "mystery", "romance"]),
        wordCount: 84260,
        createdAt: toDate("2026-04-12"),
        updatedAt: toDate("2026-06-28")
      },
      {
        id: "novel-cristal",
        title: "El Archivo de Cristal",
        synopsis:
          "Una aprendiz de bibliotecaria descubre que algunos libros recuerdan versiones alternativas de sus lectores.",
        status: "Planning",
        genre: "Fantasy / Mystery",
        tags: json(["library", "magic", "quiet"]),
        wordCount: 18400,
        createdAt: toDate("2026-05-04"),
        updatedAt: toDate("2026-06-24")
      },
      {
        id: "novel-sombras",
        title: "Sombras Bajo la Lluvia",
        synopsis:
          "Un club escolar investiga desapariciones conectadas con una estacion abandonada que solo aparece cuando llueve.",
        status: "Revision",
        genre: "School Mystery / Supernatural",
        tags: json(["rain", "school", "supernatural"]),
        wordCount: 53620,
        createdAt: toDate("2026-02-18"),
        updatedAt: toDate("2026-06-20")
      }
    ]
  });

  await prisma.volume.createMany({
    data: [
      {
        id: "vol-1",
        novelId: "novel-eco-azul",
        title: "Volume 1: El eco detras de la puerta",
        sortOrder: 1,
        summary:
          "Akira entra a la Academia Seiryu y conoce a Reina, la unica estudiante que parece escuchar la voz de la torre."
      },
      {
        id: "vol-2",
        novelId: "novel-eco-azul",
        title: "Volume 2: Las campanas de medianoche",
        sortOrder: 2,
        summary:
          "La investigacion se acerca al origen del simbolo prohibido y a la familia Tsukishiro."
      },
      {
        id: "vol-extra",
        novelId: "novel-eco-azul",
        title: "Extras",
        sortOrder: 3,
        summary: "Interludios, perfiles y escenas alternativas."
      }
    ]
  });

  await prisma.chapter.createMany({
    data: [
      {
        id: "ch-prologue",
        volumeId: "vol-1",
        title: "Prologue",
        summary: "Una voz llama desde la Torre Sellada.",
        status: "Ready",
        sortOrder: 1,
        wordCount: 3200
      },
      {
        id: "ch-1",
        volumeId: "vol-1",
        title: "Chapter 1: La puerta que no debia abrirse",
        summary: "Akira llega a Seiryu y rompe su primera regla.",
        status: "Writing",
        sortOrder: 2,
        wordCount: 7400
      },
      {
        id: "ch-2",
        volumeId: "vol-1",
        title: "Chapter 2: El mapa invisible",
        summary: "Mika reconoce un patron oculto en el mapa del campus.",
        status: "Draft",
        sortOrder: 3,
        wordCount: 6900
      }
    ]
  });

  await prisma.location.createMany({
    data: [
      {
        id: "place-academia",
        novelId: "novel-eco-azul",
        name: "Academia Seiryu",
        type: "building",
        region: "Montanas del norte",
        description:
          "Internado antiguo rodeado por niebla, con aulas de madera clara y corredores que cambian levemente despues de medianoche.",
        importance: "Escenario principal y contenedor del misterio.",
        visualNotes: "Campanarios azules, patios de piedra, lamparas calidas.",
        rules: "Ningun estudiante puede entrar a la Torre Sellada.",
        firstAppearance: "Prologue"
      },
      {
        id: "place-biblioteca",
        novelId: "novel-eco-azul",
        name: "Biblioteca Antigua",
        type: "building",
        region: "Ala oeste",
        description:
          "Biblioteca circular con estantes moviles y un catalogo escrito en tinta que aparece bajo luz azul.",
        importance: "Centro de investigacion del equipo.",
        visualNotes: "Madera oscura, polvo dorado, vitrales con simbolos.",
        rules: "Los libros prestados regresan solos si se revela un secreto.",
        firstAppearance: "Chapter 2"
      },
      {
        id: "place-torre",
        novelId: "novel-eco-azul",
        name: "Torre Sellada",
        type: "other",
        region: "Patio norte",
        description:
          "Torre sin puerta visible desde afuera. Por dentro contiene escaleras imposibles y ecos de voces familiares.",
        importance: "Misterio central.",
        visualNotes: "Piedra fria, luz azul, marcas de campana en las paredes.",
        rules: "La torre recuerda el nombre de quien baja al tercer descanso.",
        firstAppearance: "Chapter 1"
      }
    ]
  });

  await prisma.scene.createMany({
    data: [
      {
        id: "scene-1",
        chapterId: "ch-1",
        title: "Scene 1: Llegada a la Academia Seiryu",
        content:
          "-No debiste abrir esa puerta -dijo Reina.\nYo, por supuesto, abri la puerta.\n\nLa bisagra respondio con un gemido tan antiguo que por un instante pense que toda la Academia Seiryu habia contenido la respiracion.",
        summary: "Akira abre una puerta prohibida junto a Reina.",
        status: "Writing",
        sortOrder: 1,
        wordCount: 510,
        objective: "Presentar la curiosidad de Akira y la advertencia de Reina."
      },
      {
        id: "scene-2",
        chapterId: "ch-1",
        title: "Scene 2: La advertencia de Reina",
        content:
          "Reina no grito cuando la campana sono bajo nuestros pies. Eso fue lo primero que me inquieto.",
        summary: "La torre imita una voz familiar.",
        status: "Draft",
        sortOrder: 2,
        wordCount: 620,
        objective: "Vincular a Mika con el misterio central."
      }
    ]
  });

  await prisma.scenePlace.createMany({ data: [
    { sceneId: "scene-1", locationId: "place-torre" },
    { sceneId: "scene-2", locationId: "place-torre" }
  ] });

  await prisma.character.createMany({
    data: [
      {
        id: "char-akira",
        novelId: "novel-eco-azul",
        name: "Akira Moriyama",
        alias: "El chico de la puerta",
        age: "16",
        role: "Protagonist",
        appearance: "Cabello negro desordenado, uniforme usado con poca disciplina.",
        personality: "Curioso, impulsivo y leal cuando entiende el peligro.",
        wayOfSpeaking: "Directo, con humor seco cuando esta nervioso.",
        goal: "Descubrir por que la torre conoce su apellido.",
        fear: "Que Mika pague el precio de sus decisiones.",
        secret: "Escucho la campana azul antes de llegar a Seiryu.",
        notes: "Su curiosidad debe causar problemas, pero tambien resolverlos.",
          status: "Active"
      },
      {
        id: "char-reina",
        novelId: "novel-eco-azul",
        name: "Reina Tsukishiro",
        alias: "Guardiana de la llave azul",
        age: "16",
        role: "Deuteragonist",
        appearance: "Cabello plateado, mirada serena, cinta azul en la muneca.",
        personality: "Reservada, precisa y protectora con quien gana su confianza.",
        wayOfSpeaking: "Formal, breve, con pausas calculadas.",
        goal: "Mantener sellada la torre sin repetir el error de su familia.",
        fear: "Convertirse en la siguiente voz atrapada en la campana.",
        secret: "Puede leer simbolos que no existen para otros estudiantes.",
        notes: "Romance lento con Akira, siempre desde tension de confianza.",
          status: "Active"
      },
      {
        id: "char-mika",
        novelId: "novel-eco-azul",
        name: "Mika Moriyama",
        alias: "Cartografa accidental",
        age: "15",
        role: "Support",
        personality: "Observadora, metodica y mas valiente de lo que admite.",
        goal: "Proteger a Akira usando logica donde el usa impulso.",
          status: "Secondary"
      },
      {
        id: "char-kuroda",
        novelId: "novel-eco-azul",
        name: "Professor Kuroda",
        alias: "Archivist of sealed rooms",
        age: "42",
        role: "Mentor / Suspect",
        personality: "Calmo, evasivo, amable solo cuando le conviene.",
        goal: "Administrar el secreto de la academia hasta elegir heredero.",
          status: "Spoiler"
      }
    ]
  });

  await prisma.relationship.createMany({
    data: [
      {
        id: "rel-akira-reina",
        novelId: "novel-eco-azul",
        fromCharacterId: "char-akira",
        toCharacterId: "char-reina",
        relationshipType: "in_love_with",
        description: "Akira is drawn to Reina's courage before he understands her burden.",
        status: "Growing",
        sinceKind: "chapter",
        sinceTargetId: "ch-1"
      },
      {
        id: "rel-mika-akira",
        novelId: "novel-eco-azul",
        fromCharacterId: "char-mika",
        toCharacterId: "char-akira",
        relationshipType: "cousin_of",
        description: "Mika is Akira's younger cousin and his most reliable critic.",
        status: "Stable",
        sinceKind: "before_story"
      },
      {
        id: "rel-reina-kuroda",
        novelId: "novel-eco-azul",
        fromCharacterId: "char-reina",
        toCharacterId: "char-kuroda",
        relationshipType: "distrusts",
        description: "Reina believes Kuroda knows more about her family than he admits.",
        isSpoiler: true,
        status: "Tense",
        sinceKind: "custom",
        since: "Prologue"
      }
    ].map((relationship) => {
      const definition = getRelationshipDefinition(relationship.relationshipType);
      return { ...relationship, ...canonicalRelationship(relationship.fromCharacterId, relationship.toCharacterId, relationship.relationshipType), category: definition.category, direction: definition.direction };
    })
  });

  await prisma.timelineEvent.createMany({
    data: [
      {
        id: "event-1",
        sortIndex: 1024,
        novelId: "novel-eco-azul",
        title: "Akira arrives at the academy.",
        internalDate: "Day 1",
        chapterId: "ch-1",
        sceneId: "scene-1",
        description: "Akira reaches Seiryu just before the evening bell."
      },
      {
        id: "event-2",
        sortIndex: 2048,
        novelId: "novel-eco-azul",
        title: "Akira meets Reina.",
        internalDate: "Day 1",
        chapterId: "ch-1",
        sceneId: "scene-1",
        description: "Reina catches Akira near the forbidden door."
      }
    ]
  });

  await prisma.timelineEventPlace.createMany({ data: [{ eventId: "event-1", locationId: "place-academia" }, { eventId: "event-2", locationId: "place-torre" }] });
  await prisma.timelineEventCharacter.createMany({ data: [{ eventId: "event-1", characterId: "char-akira" }, { eventId: "event-2", characterId: "char-akira" }, { eventId: "event-2", characterId: "char-reina" }] });

  await prisma.note.createMany({
    data: [
      {
        id: "note-1",
        novelId: "novel-eco-azul",
        linkedType: "Novel",
        linkedId: "novel-eco-azul",
        title: "Core emotional promise",
        content:
          "Every mystery scene should also test whether Akira and Reina trust each other one step more.",
        tags: "[]",
        createdAt: toDate("2026-06-28"),
        updatedAt: toDate("2026-06-28")
      },
      {
        id: "note-2",
        novelId: "novel-eco-azul",
        linkedType: "Novel",
        linkedId: "novel-eco-azul",
        title: "Kuroda reveal pacing",
        content:
          "He should answer questions truthfully but incompletely. Avoid making him a simple villain.",
        tags: "[]",
        createdAt: toDate("2026-06-25"),
        updatedAt: toDate("2026-06-25")
      }
    ]
  });

  for (const note of await prisma.note.findMany({ select: { id: true, title: true, content: true, updatedAt: true } })) {
    await prisma.note.update({ where: { id: note.id }, data: { searchText: `${note.title}\n${note.content}`.normalize("NFC").toLowerCase(), updatedAt: note.updatedAt } });
  }
  await prisma.noteCharacter.create({ data: { noteId: "note-2", characterId: "char-kuroda" } });
  for (const [noteId, names] of [["note-1", ["mystery", "romance", "use-later"]], ["note-2", ["spoiler", "volume-2"]]]) {
    for (const name of names) {
      const tag = await prisma.tag.create({ data: { id: `tag-${name}`, novelId: "novel-eco-azul", name, key: name } });
      await prisma.noteTag.create({ data: { noteId, tagId: tag.id } });
    }
  }
  await prisma.backup.createMany({
    data: [
      {
        id: "backup-2026-06-28",
        filename: "backup-2026-06-28.zip",
        size: "48.6 MB",
        includedNovels: 3,
        status: "Complete",
        createdAt: toDate("2026-06-28")
      },
      {
        id: "backup-2026-06-27",
        filename: "backup-2026-06-27.zip",
        size: "47.9 MB",
        includedNovels: 3,
        status: "Complete",
        createdAt: toDate("2026-06-27")
      }
    ]
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "activeNovelId", value: "novel-eco-azul" }
    ]
  });

  await prisma.studioConfiguration.create({
    data: {
      id: "studio",
      version: 1,
      values: json({
        language: "en",
        sidebarState: "expanded",
        editorFontSize: "18 px",
        readerFontSize: "18 px",
        readerWidth: "720 px",
        autosaveInterval: "30 seconds",
        defaultFocusMode: "Writing",
        backupRetention: "30 daily backups",
        exportDefaults: "{\"format\":\"EPUB\",\"options\":[\"Include cover\",\"Include metadata\"]}",
        typewriterFont: true,
        notionRootPageId: "",
        notionRootPageTitle: "",
        notionAutosyncEnabled: false,
        notionAutosyncIntervalMinutes: "5",
        dailyWordGoal: "1500"
      })
    }
  });
}

main()
  .then(async () => {
    await prisma?.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma?.$disconnect();
    process.exit(1);
  });
