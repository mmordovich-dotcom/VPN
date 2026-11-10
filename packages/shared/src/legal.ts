import { LEGAL_CONTENT } from './legal-content.js';
export type LegalId='offer'|'agreement'|'privacy'|'payments'|'cookies'|'contacts';
export type LegalDocument={id:LegalId;title:string;version:string;status:'DRAFT'|'APPROVED';effectiveAt:string|null;digest:string|null;body?:string};
// A reviewed release must pin the exact text, digest and effective date in source control.
// Environment flags cannot approve a draft or invent the seller's identity.
export const LEGAL_DOCUMENTS:readonly LegalDocument[]=[
 {id:'offer',title:'Публичная оферта',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.offer},
 {id:'agreement',title:'Пользовательское соглашение',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.agreement},
 {id:'privacy',title:'Конфиденциальность и персональные данные',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.privacy},
 {id:'payments',title:'Оплата, отмена и возвраты',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.payments},
 {id:'cookies',title:'Cookies и технические данные',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.cookies},
 {id:'contacts',title:'Контакты и поддержка',version:'0.1',status:'DRAFT',effectiveAt:null,...LEGAL_CONTENT.contacts}
];
export function approvedLegal(doc:LegalDocument,now=Date.now()) {return doc.status==='APPROVED'&&Boolean(doc.body&&doc.digest&&/^[a-f0-9]{64}$/.test(doc.digest)&&doc.effectiveAt&&Number.isFinite(Date.parse(doc.effectiveAt))&&Date.parse(doc.effectiveAt)<=now);}
export function publicLegal(documents:readonly LegalDocument[]=LEGAL_DOCUMENTS,now=Date.now()) {
 return documents.map(d=>({id:d.id,title:d.title,version:d.version,status:approvedLegal(d,now)?'APPROVED':'UNAVAILABLE',effectiveAt:approvedLegal(d,now)?d.effectiveAt:null,...(approvedLegal(d,now)?{digest:d.digest,url:'#/legal?document='+d.id}:{})}));
}

export const LEGAL_LINKS = [
  {
    "id": "privacy",
    "path": "/privacy",
    "label": "Политика конфиденциальности"
  },
  {
    "id": "agreement",
    "path": "/agreement",
    "label": "Пользовательское соглашение"
  },
  {
    "id": "offer",
    "path": "/offer",
    "label": "Публичная оферта"
  },
  {
    "id": "payments",
    "path": "/payments",
    "label": "Оплата и возвраты"
  },
  {
    "id": "cookies",
    "path": "/cookies",
    "label": "Cookies"
  },
  {
    "id": "contacts",
    "path": "/support-info",
    "label": "Контакты и поддержка"
  }
] as const;
export const LEGAL_PAGE_PATHS = ["/legal", ...LEGAL_LINKS.map(d=>d.path)] as const;
export function legalIdForPath(path:string) { return LEGAL_LINKS.find(d=>d.path===path.replace(/\/$/,""))?.id; }
