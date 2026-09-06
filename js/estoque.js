import { clinicaState } from './state.js';
import { showToast, renderCardGrid, comEstadoDeCarregamento, escapeHTML, confirmarAcao } from './Ferramentas.js';
import { db } from './firebase.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';
import { registrarAuditoria } from './auditoria.js';

let itemEmEdicaoId = null;

export function initEstoque() {
    renderCardGrid('est-mini-dash', [
        { id: 'est-stat-total', label: 'Lotes Registrados', initial: '0', variant: 'primary' },
        { id: 'est-stat-baixo', label: 'Abaixo do Mínimo', initial: '0', variant: 'warning', valueClass: 'warning' },
        { id: 'est-stat-vencidos', label: 'Vencidos / Críticos', initial: '0', variant: 'danger', valueClass: 'negativo' }
    ]);

    const modalEstoque = document.getElementById('modal-estoque');
    
    document.getElementById('btn-abrir-modal-estoque').addEventListener('click', () => modalEstoque.classList.add('active'));
    document.getElementById('btn-close-estoque').addEventListener('click', () => {
        modalEstoque.classList.remove('active');
        itemEmEdicaoId = null; 
        document.getElementById('form-estoque').reset();
    });

    // Filtro de pesquisa em tempo real
    document.getElementById('search-estoque').addEventListener('input', (e) => {
        atualizarTabelaEstoque(e.target.value.toLowerCase(), document.getElementById('filtro-categoria-estoque').value);
    });

    // Filtro por categoria
    document.getElementById('filtro-categoria-estoque').addEventListener('change', (e) => {
        atualizarTabelaEstoque(document.getElementById('search-estoque').value.toLowerCase(), e.target.value);
    });
    
    document.getElementById('form-estoque').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSalvar = e.target.querySelector('button[type="submit"]');

        await comEstadoDeCarregamento(btnSalvar, 'Registrando...', async () => {
            try {
                const dadosParaSalvar = {
                    codigo: document.getElementById('est-codigo').value,
                    nome: document.getElementById('est-nome').value,
                    apresentacao: document.getElementById('est-apresentacao').value,
                    anvisa: document.getElementById('est-anvisa').value,
                    categoria: document.getElementById('est-categoria').value,
                    lote: document.getElementById('est-lote').value,
                    validade: document.getElementById('est-validade').value,
                    qtd: parseInt(document.getElementById('est-qtd').value),
                    min: parseInt(document.getElementById('est-min').value),
                    controle: document.getElementById('est-controle').value,
                    clinicaId: clinicaState.sessao.clinicaId
                };

                if (itemEmEdicaoId) {
                    await updateDoc(doc(db, "estoque", itemEmEdicaoId), dadosParaSalvar);
                    showToast('Lote atualizado com sucesso.', 'success');
                    await registrarAuditoria({ acao: 'Edição', modulo: 'Estoque', descricao: `Lote atualizado: ${dadosParaSalvar.nome} (Lote ${dadosParaSalvar.lote})` });
                } else {
                    await addDoc(collection(db, "estoque"), dadosParaSalvar);
                    showToast('Item registrado no estoque com sucesso.', 'success');
                    await registrarAuditoria({ acao: 'Criação', modulo: 'Estoque', descricao: `Novo lote registrado: ${dadosParaSalvar.nome} (Lote ${dadosParaSalvar.lote})` });
                }
                
                modalEstoque.classList.remove('active');
                e.target.reset();
                itemEmEdicaoId = null; 
                
                await carregarEstoque(); 
                
            } catch (error) {
                console.error("Erro no estoque: ", error);
                showToast('Falha ao registrar item.', 'error');
            }
        });
    });
}

export function verificarAlertasEstoque() {
    // Função silenciada: os alertas agora aparecem silenciosamente no Dashboard
}

export function atualizarTabelaEstoque(filtro = '', categoria = 'todas') {
    const hoje = new Date();
    let statsBaixo = 0;
    let statsVencido = 0;

    const filtrados = clinicaState.estoque.filter(i => {
        const bateTexto = i.nome.toLowerCase().includes(filtro) || 
               i.lote.toLowerCase().includes(filtro) ||
               i.codigo.toLowerCase().includes(filtro);
        // Itens antigos, cadastrados antes da categorização, entram em "Outros"
        const bateCategoria = categoria === 'todas' || (i.categoria || 'Outros') === categoria;
        return bateTexto && bateCategoria;
    });

    document.getElementById('stock-table-body').innerHTML = filtrados.map(i => {
        const diasVenc = Math.floor((new Date(i.validade) - hoje) / (1000 * 60 * 60 * 24));
        const isVencido = diasVenc < 0;
        const isVencendo = diasVenc >= 0 && diasVenc <= 30;
        const isBaixo = i.qtd <= i.min;

        // Atualiza contadores para o Dashboard
        if (isBaixo) statsBaixo++;
        if (isVencido || isVencendo) statsVencido++;

        // Definindo o Status Visual
        let statusBadge = '<span class="badge success">Normal</span>';
        if (isVencido) statusBadge = '<span class="badge warning" style="background:#dc3545; color:white;">Vencido</span>';
        else if (isVencendo) statusBadge = `<span class="badge warning">Vence em ${diasVenc} dias</span>`;
        else if (isBaixo) statusBadge = '<span class="badge warning">Estoque Baixo</span>';

        return `<tr>
            <td>
                <span class="badge primary" style="margin-bottom:4px; display:inline-block;">${escapeHTML(i.categoria || 'Outros')}</span><br>
                <strong>${escapeHTML(i.nome)}</strong><br>
                <small style="color: #6C757D;">Cód: ${escapeHTML(i.codigo)} | ${escapeHTML(i.apresentacao)} | ${escapeHTML(i.controle)}</small>
            </td>
            <td>
                <span style="font-weight: 600;">Lote: ${escapeHTML(i.lote)}</span><br>
                <small style="color: #6C757D;">Val: ${escapeHTML(i.validade)}</small>
            </td>
            <td>
                <!-- CONTROLES RÁPIDOS DE QUANTIDADE -->
                <div class="qty-control-row">
                    <button type="button" class="btn-action qty-btn decrease btn-diminuir-qtd" data-id="${i.id}" title="Remover 1 unidade">-</button>
                    <span class="qty-value ${isBaixo ? 'low' : ''}">${i.qtd}</span>
                    <button type="button" class="btn-action qty-btn increase btn-aumentar-qtd" data-id="${i.id}" title="Adicionar 1 unidade">+</button>
                </div>
                <small class="qty-min-note">Mínimo Ideal: ${i.min}</small>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div class="row-actions">
                    <button class="btn-action btn-edit btn-editar-est" data-id="${i.id}" title="Editar Lote">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete btn-excluir-est" data-id="${i.id}" title="Excluir Item">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    // Atualiza os Cards do Mini Dashboard
    document.getElementById('est-stat-total').innerText = clinicaState.estoque.length;
    document.getElementById('est-stat-baixo').innerText = statsBaixo;
    document.getElementById('est-stat-vencidos').innerText = statsVencido;
}

// NOVA FUNÇÃO: Atualiza direto no banco e na tela sem abrir modal
async function atualizarQuantidadeRapida(id, mudanca) {
    const item = clinicaState.estoque.find(i => String(i.id) === String(id));
    if (!item) return;

    const novaQtd = parseInt(item.qtd) + mudanca;
    
    if (novaQtd < 0) {
        showToast('A quantidade não pode ser menor que zero.', 'error');
        return;
    }

    // Atualização Otimista (Muda na tela antes mesmo do banco responder, para não travar o usuário)
    item.qtd = novaQtd;
    atualizarTabelaEstoque(document.getElementById('search-estoque').value.toLowerCase());

    try {
        await updateDoc(doc(db, "estoque", id), { qtd: novaQtd });
    } catch (error) {
        console.error("Erro ao atualizar quantidade rápida: ", error);
        showToast('Erro de conexão. Quantidade revertida.', 'error');
        
        // Se der erro na internet, desfaz a alteração na tela
        item.qtd -= mudanca;
        atualizarTabelaEstoque(document.getElementById('search-estoque').value.toLowerCase());
    }
}

export async function carregarEstoque() {
    try {
        const q = query(
            collection(db, "estoque"), 
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);
        
        clinicaState.estoque = [];
                  
        querySnapshot.forEach((doc) => {
            clinicaState.estoque.push({
                ...doc.data(),
                id: String(doc.id)
            });
        });
        
        atualizarTabelaEstoque();
        verificarAlertasEstoque(); 
             
    } catch (error) {
        console.error("Erro ao buscar dados do estoque: ", error);
        showToast('Erro ao carregar o inventário.', 'error');
    }
}

// === DELEGAÇÃO DE EVENTOS: CLIQUES NA TABELA ===
const stockTableBody = document.getElementById('stock-table-body');
if (stockTableBody) {
    stockTableBody.addEventListener('click', async (e) => {
        const btnEditar = e.target.closest('.btn-editar-est');
        const btnExcluir = e.target.closest('.btn-excluir-est');
        const btnAumentar = e.target.closest('.btn-aumentar-qtd');
        const btnDiminuir = e.target.closest('.btn-diminuir-qtd');

        // Botoes rápidos de quantidade
        if (btnAumentar) {
            const idEst = btnAumentar.getAttribute('data-id');
            atualizarQuantidadeRapida(idEst, 1);
        }

        if (btnDiminuir) {
            const idEst = btnDiminuir.getAttribute('data-id');
            atualizarQuantidadeRapida(idEst, -1);
        }

        if (btnExcluir) {
            const idEst = btnExcluir.getAttribute('data-id');
            if (await confirmarAcao('Deseja realmente excluir este lote do inventário?', { titulo: 'Excluir lote', textoConfirmar: 'Excluir' })) {
                const itemExcluido = clinicaState.estoque.find(i => String(i.id) === String(idEst));
                try {
                    await deleteDoc(doc(db, "estoque", idEst));
                    showToast('Item excluído com sucesso.', 'success');
                    await registrarAuditoria({ acao: 'Exclusão', modulo: 'Estoque', descricao: `Lote excluído: ${itemExcluido ? itemExcluido.nome + ' (Lote ' + itemExcluido.lote + ')' : idEst}` });
                    await carregarEstoque();
                } catch (error) {
                    console.error("Erro ao excluir: ", error);
                    showToast('Falha ao excluir item.', 'error');
                }
            }
        }

        if (btnEditar) {
            const idEst = btnEditar.getAttribute('data-id');
            const item = clinicaState.estoque.find(i => String(i.id) === String(idEst));
            
            if (item) {
                itemEmEdicaoId = item.id; 
                
                document.getElementById('est-codigo').value = item.codigo;
                document.getElementById('est-nome').value = item.nome;
                document.getElementById('est-apresentacao').value = item.apresentacao;
                document.getElementById('est-anvisa').value = item.anvisa;
                document.getElementById('est-categoria').value = item.categoria || '';
                document.getElementById('est-lote').value = item.lote;
                document.getElementById('est-validade').value = item.validade;
                document.getElementById('est-qtd').value = item.qtd;
                document.getElementById('est-min').value = item.min;
                document.getElementById('est-controle').value = item.controle;
                
                document.getElementById('modal-estoque').classList.add('active');
            }
        }
    });
}