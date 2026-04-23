const API_BASE = 'https://script.google.com/macros/s/AKfycbwr0z0lchC0DI4XyeptI3Lid9roXTxbOdoXo9U0arDNm2X5jlEOoaPd-cSwjyJ5vt08-w/exec';

let deferredPrompt = null;

const CATEGORY_PREFIX = {
  'Escritório': 'ADM',
  'EPI': 'EPI',
  'Higienização': 'LIM',
  'Limpeza': 'LIM',
  'Informática': 'INF',
  'Farmácia': 'FAR'
};

const FIELD_HELP = {
  classe: 'Classifica a natureza do item. Ex.: Consumo para item que acaba com o uso; Permanente para item durável.',
  local: 'Local físico principal onde o item fica armazenado.',
  uso_principal: 'Indica onde ou para que o item é mais utilizado.',
  lote_validade: 'Os campos Sim/Não indicam se o item precisa controlar lote de fabricação e validade.'
};

const state = {
  boot: null,
  user: null,
  dashboard: {},
  items: [],
  stock: [],
  movs: [],
  units: [],
  suppliers: [],
  filters: {
    item: '',
    categoria: '',
    estoque: '',
    mov: '',
    tipo: ''
  },
  editingItemOriginalCode: null
};

function q(id) {
  return document.getElementById(id);
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, s => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[s]));
}

function num(v) {
  return Number(v || 0);
}

function fmt(v) {
  return num(v).toLocaleString('pt-BR');
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean).map(v => String(v).trim()))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function apiGet(params = {}) {
  const url = new URL(API_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  return res.json();
}

async function apiPost(body = {}) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function bootstrap() {
  const r = await apiGet({ action: 'bootstrap' });
  if (r.ok) {
    state.boot = r;
    document.title = `Portal de Estoque - ${r.prefeitura || 'PMRG'}`;
  }
}

async function login() {
  const usuario = q('usuario').value.trim();
  const senha = q('senha').value;
  q('loginMsg').textContent = 'Entrando...';

  const r = await apiGet({ action: 'login', usuario, senha });

  if (!r.ok) {
    q('loginMsg').textContent = r.error || 'Falha no login';
    return;
  }

  state.user = r.user;
  q('loginScreen').classList.add('hidden');
  q('app').classList.remove('hidden');
  q('userBox').innerHTML = `<strong>${esc(r.user.nome)}</strong><br><small>${esc(r.user.perfil)}</small>`;

  await loadAll();
  switchView('dashboard');
}

async function loadAll() {
  const [dash, items, stock, movs, units, suppliers] = await Promise.all([
    apiGet({ action: 'dashboard' }),
    apiGet({ action: 'items' }),
    apiGet({ action: 'stock' }),
    apiGet({ action: 'movs' }),
    apiGet({ action: 'units' }),
    apiGet({ action: 'suppliers' })
  ]);

  state.dashboard = dash.data || {};
  state.items = items.data || [];
  state.stock = stock.data || [];
  state.movs = movs.data || [];
  state.units = units.data || [];
  state.suppliers = suppliers.data || [];

  renderDashboard();
  renderItems();
  renderStock();
  renderMovs();
  renderUnits();
  renderSuppliers();
}

function closeSidebarMobile() {
  if (window.innerWidth <= 900) {
    q('sidebar')?.classList.remove('open');
    q('sidebarOverlay')?.classList.remove('show');
    document.body.classList.remove('menu-open');
  }
}

function openSidebarMobile() {
  if (window.innerWidth <= 900) {
    q('sidebar')?.classList.add('open');
    q('sidebarOverlay')?.classList.add('show');
    document.body.classList.add('menu-open');
  }
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.menu-btn').forEach(v => v.classList.remove('active'));

  q(view + 'View')?.classList.add('active');
  document.querySelector(`.menu-btn[data-view="${view}"]`)?.classList.add('active');

  const meta = {
    dashboard: ['Dashboard', 'Visão geral do sistema'],
    items: ['Itens', 'Cadastro, edição e consulta de materiais'],
    stock: ['Estoque', 'Consulta consolidada com filtros'],
    movs: ['Movimentações', 'Entradas e saídas de estoque'],
    units: ['Unidades', 'Consulta institucional'],
    suppliers: ['Fornecedores', 'Consulta de fornecedores']
  };

  q('pageTitle').textContent = meta[view][0];
  q('pageSubtitle').textContent = meta[view][1];

  closeSidebarMobile();
}

function helpChip(label, text) {
  return `<div class="help-chip"><strong>${esc(label)}:</strong> ${esc(text)}</div>`;
}

function getOptions() {
  return {
    categorias: uniq(state.items.map(x => x.categoria)),
    unidades: uniq(state.items.map(x => x.unidade)),
    classes: uniq(state.items.map(x => x.classe)),
    locais: uniq(state.items.map(x => x.local)),
    usos: uniq(state.items.map(x => x.uso_principal)),
    fornecedores: uniq([
      ...state.suppliers.map(x => x.fornecedor),
      ...state.items.map(x => x.fornecedor)
    ])
  };
}

function prefixFromCategory(cat) {
  if (CATEGORY_PREFIX[cat]) return CATEGORY_PREFIX[cat];

  return String(cat || 'ITE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
}

function generateNextCode(category) {
  const prefix = prefixFromCategory(category);

  const used = state.items
    .map(i => String(i.codigo || ''))
    .filter(c => c.startsWith(prefix))
    .map(c => parseInt(c.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));

  const next = (used.length ? Math.max(...used) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

function setSuggestedCode() {
  const cat = q('f_categoria')?.value || '';
  const codeInput = q('f_codigo');
  if (!codeInput) return;

  if (state.editingItemOriginalCode) {
    codeInput.value = state.editingItemOriginalCode;
    return;
  }

  codeInput.value = cat ? generateNextCode(cat) : '';
}

function itemFormValues() {
  return {
    codigo: q('f_codigo').value,
    original_codigo: state.editingItemOriginalCode || q('f_codigo').value,
    item: q('f_item').value,
    categoria: q('f_categoria').value,
    unidade: q('f_unidade').value,
    qtd_minima: q('f_qmin').value,
    estoque_inicial: q('f_estini').value,
    fornecedor: q('f_fornecedor').value,
    local: q('f_local').value,
    classe: q('f_classe').value,
    uso_principal: q('f_uso').value,
    observacoes: q('f_obs').value,
    controla_lote: q('f_lote').value,
    controla_validade: q('f_validade').value,
    ativo: 'SIM',
    usuario: state.user?.usuario || 'web'
  };
}

function clearItemForm() {
  [
    'f_codigo', 'f_item', 'f_categoria', 'f_unidade', 'f_qmin',
    'f_estini', 'f_fornecedor', 'f_local', 'f_classe', 'f_uso', 'f_obs'
  ].forEach(id => {
    if (q(id)) q(id).value = '';
  });

  if (q('f_lote')) q('f_lote').value = 'Não';
  if (q('f_validade')) q('f_validade').value = 'Não';

  state.editingItemOriginalCode = null;
}

async function saveItem() {
  const body = itemFormValues();
  body.action = state.editingItemOriginalCode ? 'updateItem' : 'addItem';

  if (!state.editingItemOriginalCode && !body.codigo) {
    body.codigo = generateNextCode(body.categoria);
  }

  const r = await apiPost(body);

  if (r.ok) {
    clearItemForm();
    await loadAll();
    switchView('items');
  } else {
    alert(r.error || 'Não foi possível salvar o item.');
  }
}

function editItem(code) {
  const r = state.items.find(x => String(x.codigo) === String(code));
  if (!r) return;

  state.editingItemOriginalCode = String(r.codigo);

  q('f_codigo').value = r.codigo || '';
  q('f_item').value = r.item || '';
  q('f_categoria').value = r.categoria || '';
  q('f_unidade').value = r.unidade || '';
  q('f_qmin').value = r.qtd_minima || '';
  q('f_estini').value = r.estoque_inicial || '';
  q('f_fornecedor').value = r.fornecedor || '';
  q('f_local').value = r.local || '';
  q('f_classe').value = r.classe || '';
  q('f_uso').value = r.uso_principal || '';
  q('f_obs').value = r.observacoes || '';
  q('f_lote').value = r.controla_lote || 'Não';
  q('f_validade').value = r.controla_validade || 'Não';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(code) {
  if (!confirm('Excluir item ' + code + '?')) return;

  const r = await apiPost({
    action: 'deleteItem',
    codigo: code,
    usuario: state.user?.usuario || 'web'
  });

  if (r.ok) {
    await loadAll();
  }
}

function renderItems() {
  const opt = getOptions();
  const categorias = uniq([...opt.categorias, 'Escritório', 'EPI', 'Higienização', 'Limpeza', 'Informática']);
  const unidades = uniq([...opt.unidades, 'un', 'cx', 'pct', 'resma', 'kit']);
  const classes = uniq([...opt.classes, 'Consumo', 'Permanente']);

  const list = state.items.filter(r =>
    (!state.filters.item ||
      String(r.item).toLowerCase().includes(state.filters.item.toLowerCase()) ||
      String(r.codigo).toLowerCase().includes(state.filters.item.toLowerCase())) &&
    (!state.filters.categoria || String(r.categoria) === state.filters.categoria)
  );

  q('itemsView').innerHTML = `
    <div class="panel compact-panel">
      <div class="toolbar toolbar-stack-mobile">
        <h3>Cadastro e edição de itens</h3>
        <div class="toolbar-actions sticky-mobile-actions">
          <button class="primary-btn" onclick="saveItem()">${state.editingItemOriginalCode ? 'Atualizar item' : 'Salvar item'}</button>
          <button class="ghost-btn" onclick="clearItemForm(); renderItems();">Limpar</button>
        </div>
      </div>

      <div class="info-grid">
        ${helpChip('Classe', FIELD_HELP.classe)}
        ${helpChip('Local', FIELD_HELP.local)}
        ${helpChip('Uso principal', FIELD_HELP.uso_principal)}
        ${helpChip('Lote/Validade', FIELD_HELP.lote_validade)}
      </div>

      <div class="form-grid compact-form-grid">
        <div>
          <label for="f_codigo">Código automático</label>
          <input id="f_codigo" placeholder="Gerado automaticamente" readonly />
        </div>
        <div>
          <label for="f_item">Item</label>
          <input id="f_item" placeholder="Nome do item" />
        </div>
        <div>
          <label for="f_categoria">Categoria</label>
          <input id="f_categoria" list="dl_categorias" placeholder="Escolha ou digite" oninput="setSuggestedCode()" />
        </div>

        <div>
          <label for="f_unidade">Unidade</label>
          <input id="f_unidade" list="dl_unidades" placeholder="Ex.: un, cx, pct" />
        </div>
        <div>
          <label for="f_qmin">Quantidade mínima</label>
          <input id="f_qmin" type="number" placeholder="Nível mínimo" />
        </div>
        <div>
          <label for="f_estini">Estoque inicial</label>
          <input id="f_estini" type="number" placeholder="Saldo inicial" />
        </div>

        <div>
          <label for="f_fornecedor">Fornecedor</label>
          <input id="f_fornecedor" list="dl_fornecedores" placeholder="Fornecedor principal" />
        </div>
        <div>
          <label for="f_local">Local</label>
          <input id="f_local" list="dl_locais" placeholder="Almoxarifado/local físico" />
        </div>
        <div>
          <label for="f_classe">Classe</label>
          <input id="f_classe" list="dl_classes" placeholder="Consumo ou Permanente" />
        </div>

        <div>
          <label for="f_uso">Uso principal</label>
          <input id="f_uso" list="dl_usos" placeholder="Onde o item é mais usado" />
        </div>
        <div>
          <label for="f_obs">Observações</label>
          <input id="f_obs" placeholder="Observações opcionais" />
        </div>
        <div>
          <label for="f_lote">Controla lote?</label>
          <select id="f_lote">
            <option>Não</option>
            <option>Sim</option>
          </select>
        </div>

        <div>
          <label for="f_validade">Controla validade?</label>
          <select id="f_validade">
            <option>Não</option>
            <option>Sim</option>
          </select>
        </div>
      </div>

      <datalist id="dl_categorias">${categorias.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_unidades">${unidades.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_fornecedores">${opt.fornecedores.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_locais">${opt.locais.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_classes">${classes.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_usos">${opt.usos.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="toolbar">
        <h3>Itens cadastrados</h3>
        <span class="muted">Total filtrado: ${list.length}</span>
      </div>

      <div class="filters">
        <input
          placeholder="Buscar por código ou item"
          value="${esc(state.filters.item)}"
          oninput="state.filters.item=this.value; renderItems()"
        />
        <select onchange="state.filters.categoria=this.value; renderItems()">
          <option value="">Todas as categorias</option>
          ${categorias.map(c => `<option ${state.filters.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <div></div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Item</th>
              <th>Categoria</th>
              <th>Unidade</th>
              <th>Fornecedor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${esc(r.codigo)}</td>
                <td>${esc(r.item)}</td>
                <td>${esc(r.categoria)}</td>
                <td>${esc(r.unidade)}</td>
                <td>${esc(r.fornecedor)}</td>
                <td>
                  <button class="ghost-btn" onclick="editItem('${esc(r.codigo)}')">Editar</button>
                  <button class="danger-btn" onclick="deleteItem('${esc(r.codigo)}')">Excluir</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (state.editingItemOriginalCode) {
    setTimeout(() => editItem(state.editingItemOriginalCode), 0);
  } else {
    setTimeout(setSuggestedCode, 0);
  }
}

function onMovementItemChange() {
  const code = q('m_item_codigo')?.value || '';
  const item = state.items.find(x => String(x.codigo) === String(code));

  if (!item) {
    if (q('m_item_nome')) q('m_item_nome').value = '';
    return;
  }

  q('m_item_nome').value = item.item || '';
}

async function saveMovement() {
  const codigo = q('m_item_codigo')?.value || '';
  const cadastro = state.items.find(x => String(x.codigo) === String(codigo));

  if (!cadastro) {
    alert('Selecione um item cadastrado antes de salvar a movimentação.');
    return;
  }

  const body = {
    action: 'addMovement',
    usuario: state.user?.usuario || 'web',
    codigo: cadastro.codigo,
    item: cadastro.item,
    tipo: q('m_tipo').value,
    quantidade: q('m_quantidade').value,
    unidade: q('m_unidade').value,
    responsavel: q('m_responsavel').value,
    lote: q('m_lote').value,
    validade: q('m_validade').value,
    documento: q('m_doc').value,
    fornecedor: q('m_fornecedor').value,
    observacoes: q('m_obs').value
  };

  const r = await apiPost(body);

  if (r.ok) {
    ['m_item_codigo', 'm_item_nome', 'm_quantidade', 'm_unidade', 'm_responsavel', 'm_lote', 'm_validade', 'm_doc', 'm_fornecedor', 'm_obs']
      .forEach(id => { if (q(id)) q(id).value = ''; });

    if (q('m_tipo')) q('m_tipo').value = 'Entrada';

    await loadAll();
    switchView('movs');
  } else {
    alert(r.error || 'Não foi possível salvar a movimentação.');
  }
}

async function deleteMovement(id) {
  if (!confirm('Excluir movimentação ' + id + '?')) return;

  const r = await apiPost({
    action: 'deleteMovement',
    id,
    usuario: state.user?.usuario || 'web'
  });

  if (r.ok) {
    await loadAll();
  }
}

function renderMovs() {
  const tipos = uniq(state.movs.map(x => x.tipo));
  const fornecedores = uniq([...state.suppliers.map(x => x.fornecedor), ...state.movs.map(x => x.fornecedor)]);
  const unidades = uniq([...state.units.map(x => x.unidade), ...state.movs.map(x => x.unidade)]);
  const itensOrdenados = [...state.items].sort((a, b) => String(a.item || '').localeCompare(String(b.item || ''), 'pt-BR'));

  const list = state.movs.filter(r =>
    (!state.filters.mov ||
      String(r.item).toLowerCase().includes(state.filters.mov.toLowerCase()) ||
      String(r.codigo).toLowerCase().includes(state.filters.mov.toLowerCase())) &&
    (!state.filters.tipo || String(r.tipo) === state.filters.tipo)
  );

  q('movsView').innerHTML = `
    <div class="panel">
      <div class="toolbar toolbar-stack-mobile">
        <h3>Nova movimentação</h3>
        <div class="toolbar-actions sticky-mobile-actions">
          <button class="primary-btn" onclick="saveMovement()">Salvar movimentação</button>
        </div>
      </div>

      <div class="info-grid">
        ${helpChip('Regra', 'Movimentações só podem ser feitas com itens já cadastrados no módulo Itens.')}
        ${helpChip('Item', 'Selecione o item cadastrado; o nome será preenchido automaticamente.')}
      </div>

      <div class="form-grid compact-form-grid">
        <div>
          <label for="m_item_codigo">Item cadastrado</label>
          <select id="m_item_codigo" onchange="onMovementItemChange()">
            <option value="">Selecione um item...</option>
            ${itensOrdenados.map(i => `<option value="${esc(i.codigo)}">${esc(i.codigo)} - ${esc(i.item)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="m_item_nome">Nome do item</label>
          <input id="m_item_nome" placeholder="Preenchido automaticamente" readonly />
        </div>
        <div>
          <label for="m_tipo">Tipo</label>
          <select id="m_tipo">
            <option>Entrada</option>
            <option>Saída</option>
          </select>
        </div>

        <div>
          <label for="m_quantidade">Quantidade</label>
          <input id="m_quantidade" type="number" placeholder="Quantidade" />
        </div>
        <div>
          <label for="m_unidade">Unidade destino/origem</label>
          <input id="m_unidade" list="dl_mov_unidades" placeholder="Unidade" />
        </div>
        <div>
          <label for="m_responsavel">Responsável</label>
          <input id="m_responsavel" placeholder="Responsável" />
        </div>

        <div>
          <label for="m_lote">Lote</label>
          <input id="m_lote" placeholder="Lote" />
        </div>
        <div>
          <label for="m_validade">Validade</label>
          <input id="m_validade" type="date" />
        </div>
        <div>
          <label for="m_doc">Documento</label>
          <input id="m_doc" placeholder="NF, requisição..." />
        </div>

        <div>
          <label for="m_fornecedor">Fornecedor</label>
          <input id="m_fornecedor" list="dl_mov_fornecedores" placeholder="Fornecedor" />
        </div>
        <div>
          <label for="m_obs">Observações</label>
          <input id="m_obs" placeholder="Observações" />
        </div>
      </div>

      <datalist id="dl_mov_fornecedores">${fornecedores.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
      <datalist id="dl_mov_unidades">${unidades.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="toolbar">
        <h3>Histórico de movimentações</h3>
        <span class="muted">Total filtrado: ${list.length}</span>
      </div>

      <div class="filters">
        <input
          placeholder="Buscar por item ou código"
          value="${esc(state.filters.mov)}"
          oninput="state.filters.mov=this.value; renderMovs()"
        />
        <select onchange="state.filters.tipo=this.value; renderMovs()">
          <option value="">Todos os tipos</option>
          ${tipos.map(t => `<option ${state.filters.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        <div></div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Data</th>
              <th>Código</th>
              <th>Item</th>
              <th>Tipo</th>
              <th>Qtd</th>
              <th>Unidade</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${esc(r.id)}</td>
                <td>${esc(r.data)}</td>
                <td>${esc(r.codigo)}</td>
                <td>${esc(r.item)}</td>
                <td>${esc(r.tipo)}</td>
                <td>${fmt(r.quantidade)}</td>
                <td>${esc(r.unidade)}</td>
                <td><button class="danger-btn" onclick="deleteMovement('${esc(r.id)}')">Excluir</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderStock() {
  const cats = uniq(state.stock.map(x => x.categoria));

  const list = state.stock.filter(r =>
    (!state.filters.item ||
      String(r.item).toLowerCase().includes(state.filters.item.toLowerCase()) ||
      String(r.codigo).toLowerCase().includes(state.filters.item.toLowerCase())) &&
    (!state.filters.categoria || String(r.categoria) === state.filters.categoria) &&
    (!state.filters.estoque || String(r.status_estoque) === state.filters.estoque)
  );

  q('stockView').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h3>Estoque consolidado</h3>
        <span class="muted">Total filtrado: ${list.length}</span>
      </div>

      <div class="filters">
        <input
          placeholder="Buscar por código ou item"
          value="${esc(state.filters.item)}"
          oninput="state.filters.item=this.value; renderStock()"
        />
        <select onchange="state.filters.categoria=this.value; renderStock()">
          <option value="">Todas as categorias</option>
          ${cats.map(c => `<option ${state.filters.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <select onchange="state.filters.estoque=this.value; renderStock()">
          <option value="">Todos os status</option>
          <option ${state.filters.estoque === 'OK' ? 'selected' : ''}>OK</option>
          <option ${state.filters.estoque === 'Baixo' ? 'selected' : ''}>Baixo</option>
        </select>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Item</th>
              <th>Categoria</th>
              <th>Saldo</th>
              <th>Mínimo</th>
              <th>Estoque</th>
              <th>Validade</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(r => `
              <tr>
                <td>${esc(r.codigo)}</td>
                <td>${esc(r.item)}</td>
                <td>${esc(r.categoria)}</td>
                <td>${fmt(r.saldo_atual)}</td>
                <td>${fmt(r.qtd_minima)}</td>
                <td><span class="badge ${r.status_estoque === 'Baixo' ? 'low' : 'ok'}">${esc(r.status_estoque)}</span></td>
                <td><span class="badge ${r.status_validade === 'Vencendo' ? 'low' : r.status_validade === 'Atenção' ? 'warn' : 'ok'}">${esc(r.status_validade)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderUnits() {
  q('unitsView').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h3>Unidades e setores</h3>
        <span class="muted">Registros: ${state.units.length}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Unidade</th>
              <th>Tipo</th>
              <th>Região</th>
              <th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            ${state.units.map(r => `
              <tr>
                <td>${esc(r.codigo_unidade)}</td>
                <td>${esc(r.unidade)}</td>
                <td>${esc(r.tipo)}</td>
                <td>${esc(r.regiao)}</td>
                <td>${esc(r.responsavel)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSuppliers() {
  q('suppliersView').innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <h3>Fornecedores</h3>
        <span class="muted">Registros: ${state.suppliers.length}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>CNPJ</th>
              <th>Cidade</th>
              <th>UF</th>
            </tr>
          </thead>
          <tbody>
            ${state.suppliers.map(r => `
              <tr>
                <td>${esc(r.fornecedor)}</td>
                <td>${esc(r.cnpj)}</td>
                <td>${esc(r.cidade)}</td>
                <td>${esc(r.uf)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function bindEvents() {
  q('btnLogin')?.addEventListener('click', login);
  q('btnLogout')?.addEventListener('click', () => location.reload());
  q('btnSync')?.addEventListener('click', loadAll);

  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      closeSidebarMobile();
    });
  });

  q('mobileMenuBtn')?.addEventListener('click', () => {
    if (q('sidebar')?.classList.contains('open')) {
      closeSidebarMobile();
    } else {
      openSidebarMobile();
    }
  });

  q('sidebarOverlay')?.addEventListener('click', closeSidebarMobile);

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      q('sidebar')?.classList.remove('open');
      q('sidebarOverlay')?.classList.remove('show');
      document.body.classList.remove('menu-open');
    }
  });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    q('btnInstall')?.classList.remove('hidden');
  });

  q('btnInstall')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    q('btnInstall')?.classList.add('hidden');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=6');
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await bootstrap();
});