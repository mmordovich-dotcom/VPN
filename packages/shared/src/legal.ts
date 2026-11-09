export type LegalId='offer'|'agreement'|'privacy'|'payments'|'cookies'|'contacts';
export type LegalDocument={id:LegalId;title:string;version:string;status:'DRAFT'|'APPROVED';effectiveAt:string|null;digest:string|null;body?:string};
// A reviewed release must pin the exact text, digest and effective date in source control.
// Environment flags cannot approve a draft or invent the seller's identity.
export const LEGAL_DOCUMENTS:readonly LegalDocument[]=[
 {id:'offer',title:'Публичная оферта',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null},
 {id:'agreement',title:'Пользовательское соглашение',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null},
 {id:'privacy',title:'Конфиденциальность и персональные данные',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null},
 {id:'payments',title:'Оплата, отмена и возвраты',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null},
 {id:'cookies',title:'Cookies и технические данные',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null},
 {id:'contacts',title:'Контакты и поддержка',version:'2.0-draft.1',status:'DRAFT',effectiveAt:null,digest:null}
];
export function approvedLegal(doc:LegalDocument,now=Date.now()) {return doc.status==='APPROVED'&&Boolean(doc.body&&doc.digest&&/^[a-f0-9]{64}$/.test(doc.digest)&&doc.effectiveAt&&Number.isFinite(Date.parse(doc.effectiveAt))&&Date.parse(doc.effectiveAt)<=now);}
export function publicLegal(documents:readonly LegalDocument[]=LEGAL_DOCUMENTS,now=Date.now()) {
 return documents.map(d=>({id:d.id,title:d.title,version:d.version,status:approvedLegal(d,now)?'APPROVED':'UNAVAILABLE',effectiveAt:approvedLegal(d,now)?d.effectiveAt:null,...(approvedLegal(d,now)?{digest:d.digest,url:'#/legal?document='+d.id}:{})}));
}
