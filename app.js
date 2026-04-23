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
  return String(v == null ? '' : v).replace(/[&<>"]/g, function (s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[s];
  });
}

function num(v) {
  return Number(v || 0);
}

function fmt(v) {
  return num(v).toLocaleString('pt-BR');
}

function uniq(arr) {
  return Array.from(new Set(
    (arr || [])
      .filter(Boolean)
      .map(function (v) { return String(v).trim(); })
  )).sort(function (a, b) {
    return a.localeCompare(b, 'pt-BR');
  });
}

async function apiGet(params) {
  const url = new URL(API_BASE);
  const obj = params || {};

  Object.keys(obj).forEach(function (k) {
    url.searchParams.set(k, obj[k]);
  });

  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(body || {})
  });

  return res.json();
}

async function bootstrap() {
  const r = await apiGet({ action: 'bootstrap' });

  if (r.ok) {
    state.boot = r;
    document.title = 'Portal de Estoque - ' + (r.prefeitura || 'PMRG');
  }
}

async function login() {
  const usuarioEl = q('usuario');
  const senhaEl = q('senha');
  const loginMsg = q('loginMsg');

  const usuario = usuarioEl ? usuarioEl.value.trim() : '';
  const senha = senhaEl ? senhaEl.value : '';

  if (loginMsg) loginMsg.textContent = 'Entrando...';

  try {
    const r = await apiGet({
      action: 'login',
      usuario: usuario,
      senha: senha
    });

    if (!r.ok) {
      if (loginMsg) loginMsg.textContent = r.error || 'Falha no login';
      return;
    }

    state.user = r.user || {};

    if (q('loginScreen')) q('loginScreen').classList.add('hidden');
    if (q('app')) q('app').classList.remove('hidden');

    if (q('userBox')) {
      q('userBox').innerHTML =
        '<strong>' + esc(r.user.nome) + '</strong><br><small>' + esc(r.user.perfil) + '</small>';
    }

    await loadAll();
    switchView('dashboard');
  } catch (err) {
    if (loginMsg) loginMsg.textContent = 'Erro ao conectar com o servidor.';
    console.error(err);
  }
}

async function loadAll() {
  try {
    const results = await Promise.all([
      apiGet({ action: 'dashboard' }),
      apiGet({ action: 'items' }),
      apiGet({ action: 'stock' }),
      apiGet({ action: 'movs' }),
      apiGet({ action: 'units' }),
      apiGet({ action: 'suppliers' })
    ]);

    const dash = results[0];
    const items = results[1];
    const stock = results[2];
    const movs = results[3];
    const units = results[4];
    const suppliers = results[5];

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
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    alert('Erro ao carregar dados do sistema. Verifique o app.js, a URL do Web App e o Apps Script.');
  }
}

function closeSidebarMobile() {
  if (window.innerWidth <= 900) {
    if (q('sidebar')) q('sidebar').classList.remove('open');
    if (q('sidebarOverlay')) q('sidebarOverlay').classList.remove('show');
    document.body.classList.remove('menu-open');
  }
}

function openSidebarMobile() {
  if (window.innerWidth <= 900) {
    if (q('sidebar')) q('sidebar').classList.add('open');
    if (q('sidebarOverlay')) q('sidebarOverlay').classList.add('show');
    document.body.classList.add('menu-open');
  }
}

function switchView(view) {
  Array.prototype.forEach.call(document.querySelectorAll('.view'), function (el) {
    el.classList.remove('active');
  });

  Array.prototype.forEach.call(document.querySelectorAll('.menu-btn'), function (el) {
    el.classList.remove('active');
  });

  if (q(view + 'View')) q(view + 'View').classList.add('active');

  var activeBtn = document.querySelector('.menu-btn[data-view="' + view + '"]');
  if (activeBtn) activeBtn.classList.add('active');

  const meta = {
    dashboard: ['Dashboard', 'Visão geral do sistema'],
    items: ['Itens', 'Cadastro, edição e consulta de materiais'],
    stock: ['Estoque', 'Consulta consolidada com filtros'],
    movs: ['Movimentações', 'Entradas e saídas de estoque'],
    units: ['Unidades', 'Consulta institucional'],
    suppliers: ['Fornecedores', 'Consulta de fornecedores']
  };

  if (q('pageTitle')) q('pageTitle').textContent = meta[view][0];
  if (q('pageSubtitle')) q('pageSubtitle').textContent = meta[view][1];

  closeSidebarMobile();
}

function helpChip(label, text) {
  return '<div class="help-chip"><strong>' + esc(label) + ':</strong> ' + esc(text) + '</div>';
}

function getOptions() {
  return {
    categorias: uniq(state.items.map(function (x) { return x.categoria; })),
    unidades: uniq(state.items.map(function (x) { return x.unidade; })),
    classes: uniq(state.items.map(function (x) { return x.classe; })),
    locais: uniq(state.items.map(function (x) { return x.local; })),
    usos: uniq(state.items.map(function (x) { return x.uso_principal; })),
    fornecedores: uniq(
      state.suppliers.map(function (x) { return x.fornecedor; })
        .concat(state.items.map(function (x) { return x.fornecedor; }))
    )
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
    .map(function (i) { return String(i.codigo || ''); })
    .filter(function (c) { return c.indexOf(prefix) === 0; })
    .map(function (c) { return parseInt(c.replace(prefix, ''), 10); })
    .filter(function (n) { return !isNaN(n); });

  const next = (used.length ? Math.max.apply(null, used) : 0) + 1;
  return prefix + String(next).padStart(3, '0');
}

function setSuggestedCode() {
  const catEl = q('f_categoria');
  const codeInput = q('f_codigo');

  if (!codeInput) return;

  if (state.editingItemOriginalCode) {
    codeInput.value = state.editingItemOriginalCode;
    return;
  }

  const cat = catEl ? catEl.value : '';
  codeInput.value = cat ? generateNextCode(cat) : '';
}

function renderDashboard() {
  const d = state.dashboard || {};

  if (!q('dashboardView')) return;

  q('dashboardView').innerHTML =
    '<div class="cards">' +
      '<div class="kpi"><div class="label">Total de itens</div><div class="value">' + fmt(d.totalItens || 0) + '</div></div>' +
      '<div class="kpi"><div class="label">Estoque baixo</div><div class="value">' + fmt(d.estoqueBaixo || 0) + '</div></div>' +
      '<div class="kpi"><div class="label">Validades próximas</div><div class="value">' + fmt(d.validades || 0) + '</div></div>' +
      '<div class="kpi"><div class="label">Saldo total</div><div class="value">' + fmt(d.saldoTotal || 0) + '</div></div>' +
    '</div>' +

    '<div class="layout-2">' +
      '<div class="panel">' +
        '<div class="toolbar"><h3>Top 5 saldos</h3></div>' +
        '<div class="table-wrap">' +
          '<table>' +
            '<thead>' +
              '<tr><th>Código</th><th>Item</th><th>Saldo</th><th>Status</th></tr>' +
            '</thead>' +
            '<tbody>' +
              (d.topSaldo || []).map(function (r) {
                return '<tr>' +
                  '<td>' + esc(r.codigo) + '</td>' +
                  '<td>' + esc(r.item) + '</td>' +
                  '<td>' + fmt(r.saldo_atual) + '</td>' +
                  '<td><span class="badge ' + (r.status_estoque === 'Baixo' ? 'low' : 'ok') + '">' + esc(r.status_estoque) + '</span></td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<div class="toolbar"><h3>Movimentações recentes</h3></div>' +
        '<div class="table-wrap">' +
          '<table>' +
            '<thead>' +
              '<tr><th>Data</th><th>Item</th><th>Tipo</th><th>Qtd</th></tr>' +
            '</thead>' +
            '<tbody>' +
              (d.movimentacoesRecentes || []).map(function (r) {
                return '<tr>' +
                  '<td>' + esc(r.data) + '</td>' +
                  '<td>' + esc(r.item) + '</td>' +
                  '<td>' + esc(r.tipo) + '</td>' +
                  '<td>' + fmt(r.quantidade) + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function itemFormValues() {
  return {
    codigo: q('f_codigo') ? q('f_codigo').value : '',
    original_codigo: state.editingItemOriginalCode || (q('f_codigo') ? q('f_codigo').value : ''),
    item: q('f_item') ? q('f_item').value : '',
    categoria: q('f_categoria') ? q('f_categoria').value : '',
    unidade: q('f_unidade') ? q('f_unidade').value : '',
    qtd_minima: q('f_qmin') ? q('f_qmin').value : '',
    estoque_inicial: q('f_estini') ? q('f_estini').value : '',
    fornecedor: q('f_fornecedor') ? q('f_fornecedor').value : '',
    local: q('f_local') ? q('f_local').value : '',
    classe: q('f_classe') ? q('f_classe').value : '',
    uso_principal: q('f_uso') ? q('f_uso').value : '',
    observacoes: q('f_obs') ? q('f_obs').value : '',
    controla_lote: q('f_lote') ? q('f_lote').value : 'Não',
    controla_validade: q('f_validade') ? q('f_validade').value : 'Não',
    ativo: 'SIM',
    usuario: state.user && state.user.usuario ? state.user.usuario : 'web'
  };
}

function clearItemForm() {
  [
    'f_codigo', 'f_item', 'f_categoria', 'f_unidade', 'f_qmin',
    'f_estini', 'f_fornecedor', 'f_local', 'f_classe', 'f_uso', 'f_obs'
  ].forEach(function (id) {
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
  const r = state.items.find(function (x) {
    return String(x.codigo) === String(code);
  });

  if (!r) return;

  state.editingItemOriginalCode = String(r.codigo);

  if (q('f_codigo')) q('f_codigo').value = r.codigo || '';
  if (q('f_item')) q('f_item').value = r.item || '';
  if (q('f_categoria')) q('f_categoria').value = r.categoria || '';
  if (q('f_unidade')) q('f_unidade').value = r.unidade || '';
  if (q('f_qmin')) q('f_qmin').value = r.qtd_minima || '';
  if (q('f_estini')) q('f_estini').value = r.estoque_inicial || '';
  if (q('f_fornecedor')) q('f_fornecedor').value = r.fornecedor || '';
  if (q('f_local')) q('f_local').value = r.local || '';
  if (q('f_classe')) q('f_classe').value = r.classe || '';
  if (q('f_uso')) q('f_uso').value = r.uso_principal || '';
  if (q('f_obs')) q('f_obs').value = r.observacoes || '';
  if (q('f_lote')) q('f_lote').value = r.controla_lote || 'Não';
  if (q('f_validade')) q('f_validade').value = r.controla_validade || 'Não';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(code) {
  if (!confirm('Excluir item ' + code + '?')) return;

  const r = await apiPost({
    action: 'deleteItem',
    codigo: code,
    usuario: state.user && state.user.usuario ? state.user.usuario : 'web'
  });

  if (r.ok) {
    await loadAll();
  } else {
    alert(r.error || 'Não foi possível excluir o item.');
  }
}

function renderItems() {
  const opt = getOptions();
  const categorias = uniq(opt.categorias.concat(['Escritório', 'EPI', 'Higienização', 'Limpeza', 'Informática']));
  const unidades = uniq(opt.unidades.concat(['un', 'cx', 'pct', 'resma', 'kit']));
  const classes = uniq(opt.classes.concat(['Consumo', 'Permanente']));

  const list = state.items.filter(function (r) {
    const f1 = !state.filters.item ||
      String(r.item).toLowerCase().indexOf(state.filters.item.toLowerCase()) !== -1 ||
      String(r.codigo).toLowerCase().indexOf(state.filters.item.toLowerCase()) !== -1;

    const f2 = !state.filters.categoria || String(r.categoria) === state.filters.categoria;
    return f1 && f2;
  });

  if (!q('itemsView')) return;

  q('itemsView').innerHTML =
    '<div class="panel compact-panel">' +
      '<div class="toolbar toolbar-stack-mobile">' +
        '<h3>Cadastro e edição de itens</h3>' +
        '<div class="toolbar-actions sticky-mobile-actions">' +
          '<button class="primary-btn" onclick="saveItem()">' + (state.editingItemOriginalCode ? 'Atualizar item' : 'Salvar item') + '</button>' +
          '<button class="ghost-btn" onclick="clearItemForm(); renderItems();">Limpar</button>' +
        '</div>' +
      '</div>' +

      '<div class="info-grid">' +
        helpChip('Classe', FIELD_HELP.classe) +
        helpChip('Local', FIELD_HELP.local) +
        helpChip('Uso principal', FIELD_HELP.uso_principal) +
        helpChip('Lote/Validade', FIELD_HELP.lote_validade) +
      '</div>' +

      '<div class="form-grid compact-form-grid">' +
        '<div><label for="f_codigo">Código automático</label><input id="f_codigo" placeholder="Gerado automaticamente" readonly></div>' +
        '<div><label for="f_item">Item</label><input id="f_item" placeholder="Nome do item"></div>' +
        '<div><label for="f_categoria">Categoria</label><input id="f_categoria" list="dl_categorias" placeholder="Escolha ou digite" oninput="setSuggestedCode()"></div>' +

        '<div><label for="f_unidade">Unidade</label><input id="f_unidade" list="dl_unidades" placeholder="Ex.: un, cx, pct"></div>' +
        '<div><label for="f_qmin">Quantidade mínima</label><input id="f_qmin" type="number" placeholder="Nível mínimo"></div>' +
        '<div><label for="f_estini">Estoque inicial</label><input id="f_estini" type="number" placeholder="Saldo inicial"></div>' +

        '<div><label for="f_fornecedor">Fornecedor</label><input id="f_fornecedor" list="dl_fornecedores" placeholder="Fornecedor principal"></div>' +
        '<div><label for="f_local">Local</label><input id="f_local" list="dl_locais" placeholder="Almoxarifado/local físico"></div>' +
        '<div><label for="f_classe">Classe</label><input id="f_classe" list="dl_classes" placeholder="Consumo ou Permanente"></div>' +

        '<div><label for="f_uso">Uso principal</label><input id="f_uso" list="dl_usos" placeholder="Onde o item é mais usado"></div>' +
        '<div><label for="f_obs">Observações</label><input id="f_obs" placeholder="Observações opcionais"></div>' +
        '<div><label for="f_lote">Controla lote?</label><select id="f_lote"><option>Não</option><option>Sim</option></select></div>' +

        '<div><label for="f_validade">Controla validade?</label><select id="f_validade"><option>Não</option><option>Sim</option></select></div>' +
      '</div>' +

      '<datalist id="dl_categorias">' + categorias.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_unidades">' + unidades.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_fornecedores">' + opt.fornecedores.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_locais">' + opt.locais.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_classes">' + classes.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_usos">' + opt.usos.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
    '</div>' +

    '<div class="panel" style="margin-top:16px">' +
      '<div class="toolbar">' +
        '<h3>Itens cadastrados</h3>' +
        '<span class="muted">Total filtrado: ' + list.length + '</span>' +
      '</div>' +

      '<div class="filters">' +
        '<input placeholder="Buscar por código ou item" value="' + esc(state.filters.item) + '" oninput="state.filters.item=this.value; renderItems()">' +
        '<select onchange="state.filters.categoria=this.value; renderItems()">' +
          '<option value="">Todas as categorias</option>' +
          categorias.map(function (c) {
            return '<option ' + (state.filters.categoria === c ? 'selected' : '') + '>' + esc(c) + '</option>';
          }).join('') +
        '</select>' +
        '<div></div>' +
      '</div>' +

      '<div class="table-wrap">' +
        '<table>' +
          '<thead>' +
            '<tr><th>Código</th><th>Item</th><th>Categoria</th><th>Unidade</th><th>Fornecedor</th><th>Ações</th></tr>' +
          '</thead>' +
          '<tbody>' +
            list.map(function (r) {
              return '<tr>' +
                '<td>' + esc(r.codigo) + '</td>' +
                '<td>' + esc(r.item) + '</td>' +
                '<td>' + esc(r.categoria) + '</td>' +
                '<td>' + esc(r.unidade) + '</td>' +
                '<td>' + esc(r.fornecedor) + '</td>' +
                '<td>' +
                  '<button class="ghost-btn" onclick="editItem(\'' + esc(r.codigo) + '\')">Editar</button> ' +
                  '<button class="danger-btn" onclick="deleteItem(\'' + esc(r.codigo) + '\')">Excluir</button>' +
                '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';

  if (state.editingItemOriginalCode) {
    setTimeout(function () {
      editItem(state.editingItemOriginalCode);
    }, 0);
  } else {
    setTimeout(setSuggestedCode, 0);
  }
}

function onMovementItemChange() {
  const code = q('m_item_codigo') ? q('m_item_codigo').value : '';
  const item = state.items.find(function (x) {
    return String(x.codigo) === String(code);
  });

  if (!item) {
    if (q('m_item_nome')) q('m_item_nome').value = '';
    return;
  }

  if (q('m_item_nome')) q('m_item_nome').value = item.item || '';
}

async function saveMovement() {
  const codigo = q('m_item_codigo') ? q('m_item_codigo').value : '';
  const cadastro = state.items.find(function (x) {
    return String(x.codigo) === String(codigo);
  });

  if (!cadastro) {
    alert('Selecione um item cadastrado antes de salvar a movimentação.');
    return;
  }

  const body = {
    action: 'addMovement',
    usuario: state.user && state.user.usuario ? state.user.usuario : 'web',
    codigo: cadastro.codigo,
    item: cadastro.item,
    tipo: q('m_tipo') ? q('m_tipo').value : '',
    quantidade: q('m_quantidade') ? q('m_quantidade').value : '',
    unidade: q('m_unidade') ? q('m_unidade').value : '',
    responsavel: q('m_responsavel') ? q('m_responsavel').value : '',
    lote: q('m_lote') ? q('m_lote').value : '',
    validade: q('m_validade') ? q('m_validade').value : '',
    documento: q('m_doc') ? q('m_doc').value : '',
    fornecedor: q('m_fornecedor') ? q('m_fornecedor').value : '',
    observacoes: q('m_obs') ? q('m_obs').value : ''
  };

  const r = await apiPost(body);

  if (r.ok) {
    [
      'm_item_codigo', 'm_item_nome', 'm_quantidade', 'm_unidade',
      'm_responsavel', 'm_lote', 'm_validade', 'm_doc', 'm_fornecedor', 'm_obs'
    ].forEach(function (id) {
      if (q(id)) q(id).value = '';
    });

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
    id: id,
    usuario: state.user && state.user.usuario ? state.user.usuario : 'web'
  });

  if (r.ok) {
    await loadAll();
  } else {
    alert(r.error || 'Não foi possível excluir a movimentação.');
  }
}

function renderMovs() {
  const tipos = uniq(state.movs.map(function (x) { return x.tipo; }));
  const fornecedores = uniq(
    state.suppliers.map(function (x) { return x.fornecedor; })
      .concat(state.movs.map(function (x) { return x.fornecedor; }))
  );
  const unidades = uniq(
    state.units.map(function (x) { return x.unidade; })
      .concat(state.movs.map(function (x) { return x.unidade; }))
  );
  const itensOrdenados = state.items.slice().sort(function (a, b) {
    return String(a.item || '').localeCompare(String(b.item || ''), 'pt-BR');
  });

  const list = state.movs.filter(function (r) {
    const f1 = !state.filters.mov ||
      String(r.item).toLowerCase().indexOf(state.filters.mov.toLowerCase()) !== -1 ||
      String(r.codigo).toLowerCase().indexOf(state.filters.mov.toLowerCase()) !== -1;

    const f2 = !state.filters.tipo || String(r.tipo) === state.filters.tipo;
    return f1 && f2;
  });

  if (!q('movsView')) return;

  q('movsView').innerHTML =
    '<div class="panel">' +
      '<div class="toolbar toolbar-stack-mobile">' +
        '<h3>Nova movimentação</h3>' +
        '<div class="toolbar-actions sticky-mobile-actions">' +
          '<button class="primary-btn" onclick="saveMovement()">Salvar movimentação</button>' +
        '</div>' +
      '</div>' +

      '<div class="info-grid">' +
        helpChip('Regra', 'Movimentações só podem ser feitas com itens já cadastrados no módulo Itens.') +
        helpChip('Item', 'Selecione o item cadastrado; o nome será preenchido automaticamente.') +
      '</div>' +

      '<div class="form-grid compact-form-grid">' +
        '<div><label for="m_item_codigo">Item cadastrado</label><select id="m_item_codigo" onchange="onMovementItemChange()">' +
          '<option value="">Selecione um item...</option>' +
          itensOrdenados.map(function (i) {
            return '<option value="' + esc(i.codigo) + '">' + esc(i.codigo) + ' - ' + esc(i.item) + '</option>';
          }).join('') +
        '</select></div>' +

        '<div><label for="m_item_nome">Nome do item</label><input id="m_item_nome" placeholder="Preenchido automaticamente" readonly></div>' +
        '<div><label for="m_tipo">Tipo</label><select id="m_tipo"><option>Entrada</option><option>Saída</option></select></div>' +

        '<div><label for="m_quantidade">Quantidade</label><input id="m_quantidade" type="number" placeholder="Quantidade"></div>' +
        '<div><label for="m_unidade">Unidade destino/origem</label><input id="m_unidade" list="dl_mov_unidades" placeholder="Unidade"></div>' +
        '<div><label for="m_responsavel">Responsável</label><input id="m_responsavel" placeholder="Responsável"></div>' +

        '<div><label for="m_lote">Lote</label><input id="m_lote" placeholder="Lote"></div>' +
        '<div><label for="m_validade">Validade</label><input id="m_validade" type="date"></div>' +
        '<div><label for="m_doc">Documento</label><input id="m_doc" placeholder="NF, requisição..."></div>' +

        '<div><label for="m_fornecedor">Fornecedor</label><input id="m_fornecedor" list="dl_mov_fornecedores" placeholder="Fornecedor"></div>' +
        '<div><label for="m_obs">Observações</label><input id="m_obs" placeholder="Observações"></div>' +
      '</div>' +

      '<datalist id="dl_mov_fornecedores">' + fornecedores.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
      '<datalist id="dl_mov_unidades">' + unidades.map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join('') + '</datalist>' +
    '</div>' +

    '<div class="panel" style="margin-top:16px">' +
      '<div class="toolbar">' +
        '<h3>Histórico de movimentações</h3>' +
        '<span class="muted">Total filtrado: ' + list.length + '</span>' +
      '</div>' +

      '<div class="filters">' +
        '<input placeholder="Buscar por item ou código" value="' + esc(state.filters.mov) + '" oninput="state.filters.mov=this.value; renderMovs()">' +
        '<select onchange="state.filters.tipo=this.value; renderMovs()">' +
          '<option value="">Todos os tipos</option>' +
          tipos.map(function (t) {
            return '<option ' + (state.filters.tipo === t ? 'selected' : '') + '>' + esc(t) + '</option>';
          }).join('') +
        '</select>' +
        '<div></div>' +
      '</div>' +

      '<div class="table-wrap">' +
        '<table>' +
          '<thead>' +
            '<tr><th>ID</th><th>Data</th><th>Código</th><th>Item</th><th>Tipo</th><th>Qtd</th><th>Unidade</th><th>Ações</th></tr>' +
          '</thead>' +
          '<tbody>' +
            list.map(function (r) {
              return '<tr>' +
                '<td>' + esc(r.id) + '</td>' +
                '<td>' + esc(r.data) + '</td>' +
                '<td>' + esc(r.codigo) + '</td>' +
                '<td>' + esc(r.item) + '</td>' +
                '<td>' + esc(r.tipo) + '</td>' +
                '<td>' + fmt(r.quantidade) + '</td>' +
                '<td>' + esc(r.unidade) + '</td>' +
                '<td><button class="danger-btn" onclick="deleteMovement(\'' + esc(r.id) + '\')">Excluir</button></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

function renderStock() {
  const cats = uniq(state.stock.map(function (x) { return x.categoria; }));

  const list = state.stock.filter(function (r) {
    const f1 = !state.filters.item ||
      String(r.item).toLowerCase().indexOf(state.filters.item.toLowerCase()) !== -1 ||
      String(r.codigo).toLowerCase().indexOf(state.filters.item.toLowerCase()) !== -1;

    const f2 = !state.filters.categoria || String(r.categoria) === state.filters.categoria;
    const f3 = !state.filters.estoque || String(r.status_estoque) === state.filters.estoque;
    return f1 && f2 && f3;
  });

  if (!q('stockView')) return;

  q('stockView').innerHTML =
    '<div class="panel">' +
      '<div class="toolbar">' +
        '<h3>Estoque consolidado</h3>' +
        '<span class="muted">Total filtrado: ' + list.length + '</span>' +
      '</div>' +

      '<div class="filters">' +
        '<input placeholder="Buscar por código ou item" value="' + esc(state.filters.item) + '" oninput="state.filters.item=this.value; renderStock()">' +
        '<select onchange="state.filters.categoria=this.value; renderStock()">' +
          '<option value="">Todas as categorias</option>' +
          cats.map(function (c) {
            return '<option ' + (state.filters.categoria === c ? 'selected' : '') + '>' + esc(c) + '</option>';
          }).join('') +
        '</select>' +
        '<select onchange="state.filters.estoque=this.value; renderStock()">' +
          '<option value="">Todos os status</option>' +
          '<option ' + (state.filters.estoque === 'OK' ? 'selected' : '') + '>OK</option>' +
          '<option ' + (state.filters.estoque === 'Baixo' ? 'selected' : '') + '>Baixo</option>' +
        '</select>' +
      '</div>' +

      '<div class="table-wrap">' +
        '<table>' +
          '<thead>' +
            '<tr><th>Código</th><th>Item</th><th>Categoria</th><th>Saldo</th><th>Mínimo</th><th>Estoque</th><th>Validade</th></tr>' +
          '</thead>' +
          '<tbody>' +
            list.map(function (r) {
              const badgeClass = r.status_validade === 'Vencendo' ? 'low' : (r.status_validade === 'Atenção' ? 'warn' : 'ok');
              return '<tr>' +
                '<td>' + esc(r.codigo) + '</td>' +
                '<td>' + esc(r.item) + '</td>' +
                '<td>' + esc(r.categoria) + '</td>' +
                '<td>' + fmt(r.saldo_atual) + '</td>' +
                '<td>' + fmt(r.qtd_minima) + '</td>' +
                '<td><span class="badge ' + (r.status_estoque === 'Baixo' ? 'low' : 'ok') + '">' + esc(r.status_estoque) + '</span></td>' +
                '<td><span class="badge ' + badgeClass + '">' + esc(r.status_validade) + '</span></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

function renderUnits() {
  if (!q('unitsView')) return;

  q('unitsView').innerHTML =
    '<div class="panel">' +
      '<div class="toolbar">' +
        '<h3>Unidades e setores</h3>' +
        '<span class="muted">Registros: ' + state.units.length + '</span>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>Código</th><th>Unidade</th><th>Tipo</th><th>Região</th><th>Responsável</th></tr></thead>' +
          '<tbody>' +
            state.units.map(function (r) {
              return '<tr>' +
                '<td>' + esc(r.codigo_unidade) + '</td>' +
                '<td>' + esc(r.unidade) + '</td>' +
                '<td>' + esc(r.tipo) + '</td>' +
                '<td>' + esc(r.regiao) + '</td>' +
                '<td>' + esc(r.responsavel) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

function renderSuppliers() {
  if (!q('suppliersView')) return;

  q('suppliersView').innerHTML =
    '<div class="panel">' +
      '<div class="toolbar">' +
        '<h3>Fornecedores</h3>' +
        '<span class="muted">Registros: ' + state.suppliers.length + '</span>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table>' +
          '<thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Cidade</th><th>UF</th></tr></thead>' +
          '<tbody>' +
            state.suppliers.map(function (r) {
              return '<tr>' +
                '<td>' + esc(r.fornecedor) + '</td>' +
                '<td>' + esc(r.cnpj) + '</td>' +
                '<td>' + esc(r.cidade) + '</td>' +
                '<td>' + esc(r.uf) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
}

function bindEvents() {
  if (q('btnLogin')) q('btnLogin').addEventListener('click', login);
  if (q('btnLogout')) q('btnLogout').addEventListener('click', function () { location.reload(); });
  if (q('btnSync')) q('btnSync').addEventListener('click', loadAll);

  Array.prototype.forEach.call(document.querySelectorAll('.menu-btn'), function (btn) {
    btn.addEventListener('click', function () {
      switchView(btn.getAttribute('data-view'));
      closeSidebarMobile();
    });
  });

  if (q('mobileMenuBtn')) {
    q('mobileMenuBtn').addEventListener('click', function () {
      if (q('sidebar') && q('sidebar').classList.contains('open')) {
        closeSidebarMobile();
      } else {
        openSidebarMobile();
      }
    });
  }

  if (q('sidebarOverlay')) {
    q('sidebarOverlay').addEventListener('click', closeSidebarMobile);
  }

  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) {
      if (q('sidebar')) q('sidebar').classList.remove('open');
      if (q('sidebarOverlay')) q('sidebarOverlay').classList.remove('show');
      document.body.classList.remove('menu-open');
    }
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (q('btnInstall')) q('btnInstall').classList.remove('hidden');
  });

  if (q('btnInstall')) {
    q('btnInstall').addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      q('btnInstall').classList.add('hidden');
    });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js?v=6');
    });
  }
}

document.addEventListener('DOMContentLoaded', async function () {
  bindEvents();
  await bootstrap();
});