import { clinicaState } from './state.js';
import { formatCurrency, showToast, renderCardGrid, comEstadoDeCarregamento, escapeHTML, confirmarAcao } from './Ferramentas.js';
import { db, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, where } from './firebase.js';
import { registrarAuditoria } from './auditoria.js';

// ========================================================
// PACOTES DE ATENDIMENTO
// Pedido da clínica (equipe multidisciplinar - psicologia, terapia
// ocupacional, fisioterapia - pra crianças com TEA/TDAH): um pacote
// tem um preço FECHADO, definido de uma vez (não é a soma de sessões
// individuais menos um desconto). Cadastro e edição são exclusivos
// do Administrador (ver aplicarPermissoesDeTela em login.js).
//
// AINDA EM ABERTO (combinado com o cliente): como o pacote se conecta
// com a Agenda (quantas sessões, fechamento semanal, quem consome o
// quê) e como o pagamento entra automaticamente no Financeiro. Por
// enquanto, este módulo só cadastra o catálogo de pacotes com nome,
// descrição e valor fechado - o financeiro.js usa esse catálogo como
// atalho pra pré-preencher um lançamento de Receita na hora de cobrar,
// mas quem lança continua sendo uma ação manual (Livro Caixa normal).
// ========================================================

let pacoteEmEdicaoId = null;

export function initPacotes() {
    renderCardGrid('pac-mini-dash', [
        { id: 'pac-stat-total', label: 'Pacotes Cadastrados', initial: '0', variant: 'primary' },
        { id: 'pac-stat-media', label: 'Valor Médio', initial: 'R$ 0,00', variant: 'success', valueClass: 'positivo' }
    ]);

    const modal = document.getElementById('modal-pacote');
    const btnAbrir = document.getElementById('btn-abrir-modal-pacote');
    const btnFechar = document.getElementById('btn-close-pacote');

    if (btnAbrir) {
        btnAbrir.addEventListener('click', () => modal.classList.add('active'));
    }

    if (btnFechar) {
        btnFechar.addEventListener('click', () => {
            modal.classList.remove('active');
            fecharFormularioPacote();
        });
    }

    const search = document.getElementById('search-pacotes');
    if (search) {
        search.addEventListener('input', (e) => atualizarTabelaPacotes(e.target.value.toLowerCase()));
    }

    const form = document.getElementById('form-pacote');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSalvar = e.target.querySelector('button[type="submit"]');

            await comEstadoDeCarregamento(btnSalvar, 'Salvando...', async () => {
                const valorTexto = document.getElementById('pac-valor').value.replace(/\./g, '').replace(',', '.');

                if (!valorTexto || parseFloat(valorTexto) <= 0) {
                    showToast('Informe um preço fechado válido.', 'error');
                    return;
                }

                const dadosParaSalvar = {
                    nome: document.getElementById('pac-nome').value,
                    descricao: document.getElementById('pac-descricao').value,
                    valorFechado: parseFloat(valorTexto),
                    clinicaId: clinicaState.sessao.clinicaId
                };

                try {
                    if (pacoteEmEdicaoId) {
                        const docRef = doc(db, "pacotes", pacoteEmEdicaoId);
                        const docSnap = await getDoc(docRef);
                        if (!docSnap.exists()) {
                            showToast('Este pacote foi removido por outro usuário.', 'warning');
                            await carregarPacotes();
                            return;
                        }
                        await updateDoc(docRef, dadosParaSalvar);
                        showToast('Pacote atualizado com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Edição', modulo: 'Pacotes', descricao: `Pacote atualizado: ${dadosParaSalvar.nome} (${formatCurrency(dadosParaSalvar.valorFechado)})` });
                    } else {
                        await addDoc(collection(db, "pacotes"), dadosParaSalvar);
                        showToast('Pacote cadastrado com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Criação', modulo: 'Pacotes', descricao: `Novo pacote: ${dadosParaSalvar.nome} (${formatCurrency(dadosParaSalvar.valorFechado)})` });
                    }

                    modal.classList.remove('active');
                    fecharFormularioPacote();
                    await carregarPacotes();
                } catch (error) {
                    console.error("Erro ao salvar pacote: ", error);
                    showToast('Falha ao salvar o pacote.', 'error');
                }
            });
        });
    }

    const corpoTabela = document.getElementById('pacotes-table-body');
    if (corpoTabela) {
        corpoTabela.addEventListener('click', async (e) => {
            const btnEditar = e.target.closest('.btn-editar-pac');
            const btnExcluir = e.target.closest('.btn-excluir-pac');

            if (btnExcluir) {
                const id = btnExcluir.getAttribute('data-id');
                if (await confirmarAcao('Deseja realmente excluir este pacote? Ele deixará de aparecer como atalho no lançamento financeiro.', { titulo: 'Excluir pacote', textoConfirmar: 'Excluir' })) {
                    const excluido = clinicaState.pacotes.find(p => String(p.id) === String(id));
                    try {
                        await deleteDoc(doc(db, "pacotes", id));
                        showToast('Pacote excluído com sucesso.', 'success');
                        await registrarAuditoria({ acao: 'Exclusão', modulo: 'Pacotes', descricao: `Pacote excluído: ${excluido ? excluido.nome : id}` });
                        await carregarPacotes();
                    } catch (error) {
                        console.error("Erro ao excluir pacote: ", error);
                        showToast('Falha ao excluir o pacote.', 'error');
                    }
                }
            }

            if (btnEditar) {
                const id = btnEditar.getAttribute('data-id');
                const item = clinicaState.pacotes.find(p => String(p.id) === String(id));
                if (item) abrirFormularioParaEdicao(item);
            }
        });
    }
}

function fecharFormularioPacote() {
    pacoteEmEdicaoId = null;
    document.getElementById('form-pacote').reset();
}

function abrirFormularioParaEdicao(item) {
    pacoteEmEdicaoId = item.id;

    document.getElementById('pac-nome').value = item.nome;
    document.getElementById('pac-descricao').value = item.descricao;
    const valor = Number(item.valorFechado) || 0;
    document.getElementById('pac-valor').value = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    document.getElementById('modal-pacote').classList.add('active');
}

export function atualizarTabelaPacotes(filtro = '') {
    const corpo = document.getElementById('pacotes-table-body');
    if (!corpo) return;

    const filtrados = clinicaState.pacotes.filter(p =>
        p.nome.toLowerCase().includes(filtro) ||
        (p.descricao || '').toLowerCase().includes(filtro)
    );

    corpo.innerHTML = filtrados.map(p => `<tr>
            <td><strong>${escapeHTML(p.nome)}</strong></td>
            <td><small>${escapeHTML(p.descricao)}</small></td>
            <td class="positivo valor-lancamento">${formatCurrency(p.valorFechado)}</td>
            <td>
                <div class="row-actions">
                    <button class="btn-action btn-edit btn-editar-pac" data-id="${p.id}" title="Editar Pacote">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-action btn-delete btn-excluir-pac" data-id="${p.id}" title="Excluir Pacote">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`).join('');

    if (filtrados.length === 0) {
        corpo.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#6C757D; padding:20px;">Nenhum pacote cadastrado ainda.</td></tr>';
    }

    const elTotal = document.getElementById('pac-stat-total');
    const elMedia = document.getElementById('pac-stat-media');
    if (elTotal) elTotal.textContent = clinicaState.pacotes.length;
    if (elMedia) {
        const media = clinicaState.pacotes.length > 0
            ? clinicaState.pacotes.reduce((soma, p) => soma + p.valorFechado, 0) / clinicaState.pacotes.length
            : 0;
        elMedia.textContent = formatCurrency(media);
    }

    // O atalho dentro do modal de lançamento financeiro usa a mesma lista -
    // reaproveita aqui pra não precisar recarregar em dois lugares
    atualizarAtalhoDePacotesNoFinanceiro();
}

// Preenche o select "Usar um pacote fechado?" dentro do modal de Novo
// Lançamento (financeiro.js escuta a mudança desse select pra
// pré-preencher vínculo e valor).
function atualizarAtalhoDePacotesNoFinanceiro() {
    const select = document.getElementById('fin-pacote-atalho');
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Nenhum - lançamento avulso</option>' +
        clinicaState.pacotes.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (${formatCurrency(p.valorFechado)})</option>`).join('');
    select.value = valorAtual;
}

export async function carregarPacotes() {
    try {
        const q = query(
            collection(db, "pacotes"),
            where("clinicaId", "==", clinicaState.sessao.clinicaId)
        );
        const querySnapshot = await getDocs(q);

        clinicaState.pacotes = [];
        querySnapshot.forEach((doc) => {
            clinicaState.pacotes.push({ ...doc.data(), id: String(doc.id) });
        });

        clinicaState.pacotes.sort((a, b) => a.nome.localeCompare(b.nome));

        atualizarTabelaPacotes();
    } catch (error) {
        console.error("Erro ao buscar pacotes: ", error);
        showToast('Erro ao carregar os pacotes de atendimento.', 'error');
    }
}