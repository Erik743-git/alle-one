export const APPOINTMENT_DOC_PREFIX = '__ALLEONE_DOC_V1__:';



type StoredTextBlock = { type: 'text'; content: string };

type StoredImageBlock = {

  type: 'image';

  fileIndex: number;

  fileId?: string;

  dataUrl?: string;

};

type StoredBlock = StoredTextBlock | StoredImageBlock;



type AppointmentStoredDoc = {

  version: 1;

  blocks: StoredBlock[];

};



function parseAppointmentDoc(description: string): AppointmentStoredDoc | null {

  try {

    const parsed = JSON.parse(

      description.slice(APPOINTMENT_DOC_PREFIX.length),

    ) as AppointmentStoredDoc;

    if (parsed?.version === 1 && Array.isArray(parsed.blocks)) {

      return parsed;

    }

  } catch {

    /* texto legado */

  }

  return null;

}



/** Texto enviado ao TiFlux (sem JSON de blocos). */

export function appointmentDescriptionToPlainText(description: string): string {

  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) {

    return description;

  }

  const doc = parseAppointmentDoc(description);

  if (!doc) return description;

  return doc.blocks

    .map((block) => (block.type === 'text' ? block.content : '[imagem]'))

    .join('\n')

    .replace(/\n{3,}/g, '\n\n')

    .trim();

}



export type SavedAppointmentImage = {

  fileId: string;

  mimeType: string;

  base64: string;

};



/** Embute dataUrl nos blocos de imagem para exibição sem depender de download HTTP. */

export function enrichAppointmentDescriptionWithImages(

  description: string,

  savedImages: SavedAppointmentImage[],

): string {

  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) return description;

  const doc = parseAppointmentDoc(description);

  if (!doc) return description;



  const blocks = doc.blocks.map((block) => {

    if (block.type !== 'image') return block;

    const saved = savedImages[block.fileIndex];

    if (!saved) return block;

    return {

      type: 'image' as const,

      fileIndex: block.fileIndex,

      fileId: saved.fileId,

      dataUrl: `data:${saved.mimeType};base64,${saved.base64}`,

    };

  });



  return (

    APPOINTMENT_DOC_PREFIX + JSON.stringify({ version: 1, blocks } satisfies AppointmentStoredDoc)

  );

}


