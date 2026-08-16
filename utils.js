export function initials(name='Usuário'){return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()).join('')||'US'}
export function greeting(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
export function longDate(){return new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date())}
