// Cole aqui a URL /exec do NOVO Apps Script deste aplicativo.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzji3OuXJVaVblyOO7oyomZpBkggzsYWMTghdKMefstn7vsG7umNrIpJNxTjcv5MOkD/exec';
const SESSION_KEY = 'conferencia_vasilhames_session_v1';

let tokenSessao = '';
let usuarioAtual = null;
let minhas = [];
let historico = [];
let dashboard = [];
let usuarios = [];
let usuarioEditando = null;
let postRequestsEmAndamento = 0;

const $ = id => document.getElementById(id);
const isAdmin = () => usuarioAtual && usuarioAtual.perfil === 'ADMIN';
const brl = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pad = n => String(n).padStart(2,'0');
const horaHms = v => { const s=String(v||'').trim(); if(!s) return '—'; const m=s.match(/(?:^|\s)(\d{1,2}):(\d{2}):(\d{2})(?:\s|$)/); if(m) return `${pad(m[1])}:${m[2]}:${m[3]}`; const d=new Date(s); return Number.isNaN(d.getTime())?s:`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

window.addEventListener('DOMContentLoaded', iniciar);

async function iniciar(){
  bindEventos();
  atualizarRelogio(); setInterval(atualizarRelogio,1000);
  await checarBackend();
  const sessao = lerSessaoLocal();
  if(sessao && sessao.token){
    tokenSessao = sessao.token;
    try{
      const d = await getApi('sessao');
      if(d.status === 'success'){
        usuarioAtual = d.usuario;
        salvarSessaoLocal();
        entrarApp();
        return;
      }
    }catch(_e){}
    limparSessaoLocal();
  }
  mostrarLogin();
}

function bindEventos(){
  $('loginForm').addEventListener('submit', fazerLogin);
  $('toggleSenha').addEventListener('click',()=>{
    const c=$('loginSenha'); const show=c.type==='password'; c.type=show?'text':'password'; $('toggleSenha').textContent=show?'Ocultar':'Mostrar';
  });
  $('btnLogout').addEventListener('click', logout);
  $('sidebarLogout').addEventListener('click', logout);
  $('menuBtn').addEventListener('click',()=>{$('sidebar').classList.toggle('aberta');$('overlay').classList.toggle('ativo')});
  $('overlay').addEventListener('click',fecharMenuMobile);
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>abrirView(b.dataset.view)));

  $('campoMapa').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,''));
  $('formConferencia').addEventListener('submit',salvarConferencia);
  $('btnLimpar').addEventListener('click',limparConferencia);

  ['filtroMinhasMapa','filtroMinhasData'].forEach(id=>$(id).addEventListener('input',renderMinhas));
  $('btnAtualizarMinhas').addEventListener('click',()=>carregarMinhas(true));

  ['histMapa','histConferente','histDe','histAte'].forEach(id=>$(id).addEventListener('input',renderHistorico));
  $('btnAtualizarHistorico').addEventListener('click',()=>carregarHistorico(true));
  $('btnBaixarHistorico').addEventListener('click',baixarHistoricoCsv);

  ['dashData','dashMapa','dashCidade'].forEach(id=>$(id).addEventListener('input',renderDashboard));
  $('btnAtualizarDashboard').addEventListener('click',()=>carregarDashboard(true));

  $('formUsuario').addEventListener('submit',salvarUsuario);
  $('btnNovoUsuario').addEventListener('click',limparUsuarioForm);

  $('btnFecharModal').addEventListener('click',()=>fecharModal());
  $('modalDetalhe').addEventListener('click',e=>{if(e.target===$('modalDetalhe')) fecharModal()});
}

async function checarBackend(){
  const el=$('backendStatus');
  if(!WEB_APP_URL.startsWith('https://script.google.com/macros/s/')){
    el.className='backend-status error'; el.querySelector('span').textContent='Configure a URL do Apps Script'; return false;
  }
  try{
    const r=await fetch(`${WEB_APP_URL}?acao=health&_=${Date.now()}`,{cache:'no-store'});
    const d=await lerRespostaJson(r);
    if(d.status==='success'){
      el.className='backend-status ok'; el.querySelector('span').textContent=`Sistema conectado • v${d.versao||'1.0'}`; return true;
    }
    throw new Error();
  }catch(_e){
    el.className='backend-status error'; el.querySelector('span').textContent='Não foi possível conectar ao Apps Script'; return false;
  }
}

async function fazerLogin(e){
  e.preventDefault();
  const btn=$('btnLogin'); const usuario=$('loginUsuario').value.trim(); const senha=$('loginSenha').value;
  if(!usuario||!senha) return mostrarLoginMsg('Informe usuário e senha.');
  btn.disabled=true; btn.textContent='Entrando...'; mostrarLoginMsg('');
  try{
    const d=await postApi({acao:'login',usuario,senha},true);
    if(d.status!=='success') throw new Error(d.message||'Não foi possível entrar.');
    tokenSessao=d.token; usuarioAtual=d.usuario; salvarSessaoLocal(); $('loginSenha').value=''; entrarApp();
  }catch(err){ mostrarLoginMsg(err.message||String(err)); }
  finally{btn.disabled=false;btn.innerHTML='Entrar <span>→</span>';}
}

function entrarApp(){
  $('loginScreen').classList.add('oculto'); $('app').classList.remove('oculto');
  aplicarUsuario();
  abrirView('conferencia');
}
function mostrarLogin(){ $('app').classList.add('oculto');$('loginScreen').classList.remove('oculto');setTimeout(()=>$('loginUsuario').focus(),80); }
function mostrarLoginMsg(m){$('loginMessage').textContent=m||'';}

function aplicarUsuario(){
  const nome=usuarioAtual?.nome||usuarioAtual?.usuario||'Usuário'; const perfil=isAdmin()?'ADMIN':'CONFERENTE';
  $('userName').textContent=nome; $('userProfile').textContent=perfil; $('mobileUserName').textContent=nome; $('mobileUserProfile').textContent=perfil;
  $('userAvatar').textContent=nome.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase(); $('formConferente').textContent=nome;
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('oculto',!isAdmin()));
  document.querySelectorAll('.conferente-only').forEach(el=>el.classList.toggle('oculto',isAdmin()));
}

async function logout(){
  const antigo=tokenSessao;
  tokenSessao=''; usuarioAtual=null; limparSessaoLocal(); fecharMenuMobile(); mostrarLogin();
  minhas=[]; historico=[]; dashboard=[]; usuarios=[];
  if(antigo){
    try{ await postApiComToken({acao:'logout'},antigo); }catch(_e){}
  }
}

function salvarSessaoLocal(){ try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:tokenSessao,usuario:usuarioAtual}));}catch(_e){} }
function lerSessaoLocal(){ try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(_e){return null;} }
function limparSessaoLocal(){ try{sessionStorage.removeItem(SESSION_KEY);}catch(_e){} }

const views={
  conferencia:['Conferência de vasilhames','Registro de retorno por mapa'],
  minhas:['Minhas conferências','Seu histórico individual'],
  historico:['Histórico de conferências','Todos os registros realizados'],
  dashboard:['Dashboard comparativo','Planejado x conferido por mapa'],
  usuarios:['Gestão de usuários','Perfis de acesso ao sistema']
};
async function abrirView(nome){
  if(['historico','dashboard','usuarios'].includes(nome)&&!isAdmin()) nome='conferencia';
  if(nome==='minhas'&&isAdmin()) nome='conferencia';
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('ativo'));
  document.querySelectorAll('.nav-item').forEach(v=>v.classList.toggle('ativo',v.dataset.view===nome));
  $(`view-${nome}`).classList.add('ativo'); $('topTitle').textContent=views[nome][0];$('topSubtitle').textContent=views[nome][1]; fecharMenuMobile();
  if(nome==='minhas') await carregarMinhas();
  if(nome==='historico') await carregarHistorico();
  if(nome==='dashboard') { if(!$('dashData').value) $('dashData').value=dataHojeIso(); await carregarDashboard(); }
  if(nome==='usuarios') await carregarUsuarios();
}
function fecharMenuMobile(){$('sidebar').classList.remove('aberta');$('overlay').classList.remove('ativo');}

function atualizarRelogio(){
  const d=new Date(); const s=`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if($('formAgora')) $('formAgora').textContent=s;
}

async function salvarConferencia(e){
  e.preventDefault(); const btn=$('btnSalvarConferencia');
  const mapa=$('campoMapa').value.trim(); if(!mapa) return toast('Informe o mapa.','erro');
  const payload={acao:'salvarConferencia',mapa};
  for(const k of ['g300','g600v','g600m','glitrao','b30','b50']){
    const n=Number($(k).value); if(!Number.isInteger(n)||n<0) return toast('Todas as quantidades devem ser números inteiros iguais ou maiores que zero.','erro'); payload[k]=n;
  }
  btn.disabled=true; btn.textContent='Registrando...';
  try{
    const d=await postApi(payload); if(d.status!=='success') throw new Error(d.message||'Falha ao registrar.');
    toast(`Conferência do mapa ${mapa} registrada.`,'sucesso'); limparConferencia();
  }catch(err){tratarErro(err);}finally{btn.disabled=false;btn.textContent='Registrar conferência';}
}
function limparConferencia(){ $('campoMapa').value=''; ['g300','g600v','g600m','glitrao','b30','b50'].forEach(k=>$(k).value='0'); $('campoMapa').focus(); }

async function carregarMinhas(forcar=false){
  try{ const d=await getApi('minhasConferencias'); if(d.status!=='success') throw new Error(d.message); minhas=d.registros||[]; renderMinhas(); }
  catch(err){tratarErro(err);}
}
function renderMinhas(){
  const mapa=$('filtroMinhasMapa').value.trim().toLowerCase(); const data=isoParaBr($('filtroMinhasData').value);
  const arr=minhas.filter(r=>(!mapa||String(r.mapa).toLowerCase().includes(mapa))&&(!data||r.data===data));
  $('tbodyMinhas').innerHTML=arr.length?arr.map(r=>`<tr><td><strong>${esc(r.data)}</strong><br><small>${esc(horaHms(r.hora))}</small></td><td><strong>${esc(r.mapa)}</strong></td><td>${r.g300}</td><td>${r.g600v}</td><td>${r.g600m}</td><td>${r.glitrao}</td><td>${r.b30}</td><td>${r.b50}</td></tr>`).join(''):`<tr><td colspan="8" class="empty-row">Nenhuma conferência encontrada.</td></tr>`;
}

async function carregarHistorico(){
  try{ const d=await getApi('historico'); if(d.status!=='success') throw new Error(d.message); historico=d.registros||[]; renderHistorico(); }
  catch(err){tratarErro(err);}
}
function historicoFiltrado(){
  const mapa=$('histMapa').value.trim().toLowerCase(), conf=$('histConferente').value.trim().toLowerCase(); const de=$('histDe').value, ate=$('histAte').value;
  return historico.filter(r=>{
    const iso=brParaIso(r.data); return (!mapa||String(r.mapa).toLowerCase().includes(mapa))&&(!conf||String(r.conferente).toLowerCase().includes(conf)||String(r.usuario).toLowerCase().includes(conf))&&(!de||iso>=de)&&(!ate||iso<=ate);
  });
}
function renderHistorico(){
  const arr=historicoFiltrado(); $('tbodyHistorico').innerHTML=arr.length?arr.map(r=>`<tr><td>${esc(r.data)}</td><td>${esc(horaHms(r.hora))}</td><td><strong>${esc(r.conferente||r.usuario||'—')}</strong></td><td><strong>${esc(r.mapa)}</strong></td><td>${esc(r.cidade||'—')}</td><td>${esc(r.motorista||'—')}</td><td>${esc(r.ajudante1||'—')}</td><td>${esc(r.ajudante2||'—')}</td><td>${r.g300}</td><td>${r.g600v}</td><td>${r.g600m}</td><td>${r.glitrao}</td><td>${r.b30}</td><td>${r.b50}</td></tr>`).join(''):`<tr><td colspan="14" class="empty-row">Nenhum registro encontrado.</td></tr>`;
}
function baixarHistoricoCsv(){
  const arr=historicoFiltrado(); if(!arr.length) return toast('Não há registros para baixar.','erro');
  const head=['Data','Hora','Conferente Usuário','Conferente Nome','Mapa','Cidade','Motorista','Ajudante 1','Ajudante 2','Garrafeiras de 300ml','Garrafeiras de 600ml Verde','Garrafeiras de 600ml Marrom','Garrafeiras de Litrão','Barris de Chopp 30L','Barris de Chopp 50L'];
  const rows=arr.map(r=>[r.data,horaHms(r.hora),r.usuario,r.conferente,r.mapa,r.cidade||'',r.motorista||'',r.ajudante1||'',r.ajudante2||'',r.g300,r.g600v,r.g600m,r.glitrao,r.b30,r.b50]);
  const csv='\ufeff'+[head,...rows].map(row=>row.map(csvVal).join(';')).join('\r\n');
  baixarBlob(csv,'historico_conferencias_'+dataHojeIso()+'.csv','text/csv;charset=utf-8;');
}

async function carregarDashboard(){
  try{ const d=await getApi('dashboard'); if(d.status!=='success') throw new Error(d.message); dashboard=d.linhas||[]; renderDashboard(); }
  catch(err){tratarErro(err);}
}
function dashboardFiltrado(){
  const data=isoParaBr($('dashData').value), mapa=$('dashMapa').value.trim().toLowerCase(), cidade=$('dashCidade').value.trim().toLowerCase();
  return dashboard.filter(r=>(!data||r.data===data)&&(!mapa||String(r.mapa).toLowerCase().includes(mapa))&&(!cidade||String(r.cidade).toLowerCase().includes(cidade)));
}
function renderDashboard(){
  const arr=dashboardFiltrado();
  const planejados=arr.filter(r=>r.status!=='MAPA_NAO_ENCONTRADO').length;
  const conferidos=arr.filter(r=>!['SEM_CONFERENCIA'].includes(r.status)).length;
  const pendentes=arr.filter(r=>r.status==='SEM_CONFERENCIA').length;
  const divergentes=arr.filter(r=>r.status==='DIVERGENTE'||r.status==='MAPA_NAO_ENCONTRADO').length;
  const valor=arr.reduce((s,r)=>s+Number(r.valorDivergencia||0),0);
  $('kpiPlanejados').textContent=planejados; $('kpiConferidos').textContent=conferidos; $('kpiPendentes').textContent=pendentes; $('kpiDivergentes').textContent=divergentes; $('kpiValor').textContent=brl(valor);
  $('tbodyDashboard').innerHTML=arr.length?arr.map((r,i)=>{
    const st=statusInfo(r.status); const equipe=[r.motorista,r.ajudante1,r.ajudante2].filter(Boolean).join(' • ')||'—';
    return `<tr><td><strong>${esc(r.data)} • Mapa ${esc(r.mapa)}</strong></td><td>${esc(r.cidade||'—')}</td><td>${esc(equipe)}</td><td>${esc(r.conferente||'—')}</td><td><span class="status ${st.cls}">${st.label}</span></td><td>${r.quantidadeDivergente||0}</td><td class="${r.valorDivergencia?'money-bad':''}">${brl(r.valorDivergencia)}</td><td><button class="btn-mini" onclick="abrirDetalheDashboard(${i})">Detalhar</button></td></tr>`;
  }).join(''):`<tr><td colspan="8" class="empty-row">Nenhum mapa encontrado para o filtro.</td></tr>`;
  renderRankingMotoristas(arr);
  // Mantém índice visual para o modal mesmo com filtro.
  window.__dashAtual=arr;
}
function renderRankingMotoristas(arr){
  // O valor financeiro dos rankings considera somente faltas (divergências negativas).
  // A quantidade de mapas continua considerando qualquer mapa com status DIVERGENTE.
  const valorNegativoDoMapa = r => {
    if(Number.isFinite(Number(r.valorDivergenciaNegativa))) return Number(r.valorDivergenciaNegativa || 0);
    return Object.values(r.detalhes || {}).reduce((s,d)=>s+(Number(d.diferenca)<0?Number(d.valor||0):0),0);
  };

  const motoristas = new Map();
  const ajudantes = new Map();

  const acumular = (grupos, nome, r) => {
    nome=String(nome||'').trim();
    if(!nome) return;
    const chave=nome.toLocaleLowerCase('pt-BR');
    if(!grupos.has(chave)) grupos.set(chave,{nome,mapas:new Set(),valor:0});
    const g=grupos.get(chave);
    g.mapas.add(`${r.data}|${r.mapa}`);
    g.valor += valorNegativoDoMapa(r);
  };

  arr.filter(r=>r.status==='DIVERGENTE').forEach(r=>{
    acumular(motoristas,r.motorista,r);

    // Um mesmo ajudante é agrupado independentemente de ter sido Ajudante 1 ou Ajudante 2.
    // Se por erro o mesmo nome estiver nas duas posições do mesmo mapa, contabiliza apenas uma vez.
    const nomesAjudantes=[r.ajudante1,r.ajudante2]
      .map(v=>String(v||'').trim())
      .filter(Boolean);
    const unicos=new Map();
    nomesAjudantes.forEach(nome=>unicos.set(nome.toLocaleLowerCase('pt-BR'),nome));
    unicos.forEach(nome=>acumular(ajudantes,nome,r));
  });

  const preparar = grupos => [...grupos.values()]
    .map(g=>({nome:g.nome,mapas:g.mapas.size,valor:g.valor}))
    .sort((a,b)=>b.valor-a.valor||b.mapas-a.mapas||a.nome.localeCompare(b.nome,'pt-BR'));

  const rankingMotoristas=preparar(motoristas);
  const rankingAjudantes=preparar(ajudantes);
  const linha=(r,i)=>`<tr><td><span class="rank-pos">${i+1}</span></td><td><strong>${esc(r.nome)}</strong></td><td>${r.mapas}</td><td class="ranking-money">${brl(r.valor)}</td></tr>`;

  $('tbodyRankingValor').innerHTML=rankingMotoristas.length
    ?rankingMotoristas.map(linha).join('')
    :`<tr><td colspan="4" class="empty-row">Nenhum motorista com divergência no filtro.</td></tr>`;
  $('tbodyRankingMapas').innerHTML=rankingAjudantes.length
    ?rankingAjudantes.map(linha).join('')
    :`<tr><td colspan="4" class="empty-row">Nenhum ajudante com divergência no filtro.</td></tr>`;
}
function statusInfo(s){
  if(s==='OK') return {label:'SEM DIFERENÇA',cls:'ok'};
  if(s==='DIVERGENTE') return {label:'DIVERGENTE',cls:'bad'};
  if(s==='SEM_CONFERENCIA') return {label:'SEM CONFERÊNCIA',cls:'wait'};
  return {label:'MAPA FORA DA BASE',cls:'info'};
}
window.abrirDetalheDashboard=function(i){
  const r=(window.__dashAtual||[])[i]; if(!r) return;
  $('modalTitulo').textContent=`Mapa ${r.mapa}`; $('modalSubtitulo').textContent=`${r.data} • ${r.cidade||'Cidade não informada'}`;
  const tipos=[['g300','Garrafeiras 300ml'],['g600v','600ml Verde'],['g600m','600ml Marrom'],['glitrao','Garrafeiras de Litrão'],['b30','Barris de Chopp 30L'],['b50','Barris de Chopp 50L']];
  const rows=tipos.map(([k,label])=>{const d=r.detalhes[k];const cls=d.diferenca<0?'negative':d.diferenca>0?'positive':'zero';const dif=d.diferenca>0?'+'+d.diferenca:String(d.diferenca);return `<div class="compare-row"><div>${label}</div><div>${d.esperado}</div><div>${d.conferido}</div><div class="${cls}">${dif}</div><div class="${cls}">${brl(d.valor)}</div></div>`}).join('');
  const detalhes=Object.values(r.detalhes||{});
  const valorPositivo=Number(r.valorDivergenciaPositiva ?? detalhes.reduce((s,d)=>s+(Number(d.diferenca)>0?Number(d.valor||0):0),0));
  const valorNegativo=Number(r.valorDivergenciaNegativa ?? detalhes.reduce((s,d)=>s+(Number(d.diferenca)<0?Number(d.valor||0):0),0));
  $('modalConteudo').innerHTML=`<div class="detail-header"><div><span>Motorista</span><strong>${esc(r.motorista||'—')}</strong></div><div><span>Ajudante 1</span><strong>${esc(r.ajudante1||'—')}</strong></div><div><span>Ajudante 2</span><strong>${esc(r.ajudante2||'—')}</strong></div><div><span>Conferente</span><strong>${esc(r.conferente||'—')}</strong></div></div><div class="compare-grid"><div class="compare-row head"><div>Vasilhame</div><div>Planilha</div><div>Conferido</div><div>Diferença</div><div>Valor</div></div>${rows}</div><div class="detail-totals"><div class="detail-total positive-total"><span>Valor total em divergências positivas</span><strong>${brl(valorPositivo)}</strong><small>quantidades conferidas acima da planilha</small></div><div class="detail-total negative-total"><span>Valor total em divergências negativas</span><strong>${brl(valorNegativo)}</strong><small>quantidades conferidas abaixo da planilha</small></div></div>`;
  $('modalDetalhe').classList.add('aberto');
}
function fecharModal(){$('modalDetalhe').classList.remove('aberto');}

async function carregarUsuarios(){
  try{const d=await getApi('usuarios');if(d.status!=='success') throw new Error(d.message);usuarios=d.usuarios||[];renderUsuarios();}catch(err){tratarErro(err);}
}
function renderUsuarios(){
  $('tbodyUsuarios').innerHTML=usuarios.length?usuarios.map((u,i)=>`<tr><td><strong>${esc(u.nome)}</strong></td><td>${esc(u.usuario)}</td><td>${u.perfil==='ADMIN'?'Admin':'Conferente'}</td><td><span class="status ${u.ativo?'ok':'bad'}">${u.ativo?'ATIVO':'INATIVO'}</span></td><td><button class="btn-mini" onclick="editarUsuario(${i})">Editar</button></td></tr>`).join(''):`<tr><td colspan="5" class="empty-row">Nenhum usuário cadastrado.</td></tr>`;
}
window.editarUsuario=function(i){const u=usuarios[i];if(!u)return;usuarioEditando=u.usuario;$('usuarioNome').value=u.nome;$('usuarioLogin').value=u.usuario;$('usuarioLogin').readOnly=true;$('usuarioPerfil').value=u.perfil;$('usuarioSenha').value='';$('usuarioAtivo').checked=u.ativo;window.scrollTo({top:0,behavior:'smooth'});}
function limparUsuarioForm(){usuarioEditando=null;$('formUsuario').reset();$('usuarioLogin').readOnly=false;$('usuarioAtivo').checked=true;$('usuarioPerfil').value='CONFERENTE';}
async function salvarUsuario(e){
  e.preventDefault(); const payload={acao:'salvarUsuario',nome:$('usuarioNome').value.trim(),usuario:$('usuarioLogin').value.trim(),perfil:$('usuarioPerfil').value,senha:$('usuarioSenha').value,ativo:$('usuarioAtivo').checked};
  try{const d=await postApi(payload);if(d.status!=='success')throw new Error(d.message);toast('Usuário salvo.','sucesso');limparUsuarioForm();await carregarUsuarios();}catch(err){tratarErro(err);}
}

async function getApi(acao,extras={}){
  const qs=new URLSearchParams({acao,token:tokenSessao,...extras,_:String(Date.now())});
  const r=await fetch(`${WEB_APP_URL}?${qs}`,{cache:'no-store'}); const d=await lerRespostaJson(r); if(d.status==='unauthorized') throw new Error('SESSAO_EXPIRADA'); return d;
}
async function postApi(payload,semToken=false){return postApiComToken(payload,semToken?'':tokenSessao,semToken);}
async function postApiComToken(payload,token,semToken=false){
  const requestId=gerarRequestId(); const body=semToken?{...payload,requestId}:{...payload,token,requestId}; postRequestsEmAndamento++;
  let erroEnvio=null;
  try{
    fetch(WEB_APP_URL,{method:'POST',mode:'no-cors',body:JSON.stringify(body)}).catch(e=>erroEnvio=e);
    const inicio=Date.now(); let intervalo=120;
    while(Date.now()-inicio<30000){
      await esperar(intervalo); if(erroEnvio) throw new Error('Não foi possível enviar a solicitação ao Apps Script.');
      try{
        const qs=new URLSearchParams({acao:'resultadoPost',requestId,_:String(Date.now())}); const r=await fetch(`${WEB_APP_URL}?${qs}`,{cache:'no-store'}); const d=await lerRespostaJson(r);
        if(d.status==='processing'){intervalo=Math.min(450,intervalo+70);continue;} if(d.status==='unauthorized') throw new Error('SESSAO_EXPIRADA'); return d;
      }catch(e){ if(String(e.message)==='SESSAO_EXPIRADA') throw e; intervalo=Math.min(500,intervalo+80); }
    }
    throw new Error('O servidor demorou mais que o esperado. Tente novamente.');
  }finally{postRequestsEmAndamento=Math.max(0,postRequestsEmAndamento-1);}
}
function gerarRequestId(){return window.crypto&&typeof window.crypto.randomUUID==='function'?window.crypto.randomUUID():'conf-'+Date.now()+'-'+Math.random().toString(16).slice(2)}
function esperar(ms){return new Promise(r=>setTimeout(r,ms))}
async function lerRespostaJson(r){const t=await r.text();try{return JSON.parse(t)}catch(_e){throw new Error('Resposta inválida do Apps Script. Confirme a implantação e a URL /exec.')}}
function tratarErro(e){const m=String(e?.message||e||'Erro');if(m==='SESSAO_EXPIRADA'){toast('Sua sessão expirou. Entre novamente.','erro');logout();return;}toast(m,'erro');}
function toast(msg,tipo=''){const e=$('toast');e.textContent=msg;e.className='toast show '+tipo;clearTimeout(window.__toastT);window.__toastT=setTimeout(()=>e.className='toast',3200)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function csvVal(v){const s=String(v??'');return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function baixarBlob(conteudo,nome,tipo){const blob=new Blob([conteudo],{type:tipo});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nome;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function dataHojeIso(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function isoParaBr(s){if(!s)return'';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function brParaIso(s){const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
