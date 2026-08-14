import { clinicaState } from './state.js';
import { showToast, escapeHTML, confirmarAcao } from './Ferramentas.js';
import { db, collection, addDoc, doc, updateDoc, query, where, onSnapshot } from './firebase.js';
import { registrarAuditoria } from './auditoria.js';

const ICONES_TIPO = {
    retorno_pendente: 'fa-calendar-check',
    exame_solicitado: 'fa-flask-vial',
    encaminhamento: 'fa-share-from-square',
    estoque: 'fa-boxes-stacked',
    financeiro: 'fa-cash-register',
    pagamento_pendente: 'fa-hand-holding-dollar',
    geral: 'fa-bell'
};

// ========================================================
// POPUP DE CONFIRMAÇÃO DE PAGAMENTO (fundo desfocado)
// Disparado quando uma consulta é marcada como "Concluído" na
// Agenda (ver agenda.js). Reaproveita o modal de confirmação
// que já existe no sistema (Ferramentas.js) em vez de travar
// a recepção com mais um componente novo.
// ========================================================
async function tratarNotificacaoPagamento(n) {
    const confirmou = await confirmarAcao(
        `${n.mensagem} O pagamento foi realizado?`,
        { titulo: n.titulo || 'Confirmar pagamento', textoConfirmar: 'Pagamento Confirmado', perigoso: false }
    );

    if (!confirmou) {
        // Sem confirmação agora: a pendência continua na lista normal de
        // Notificações (status ainda "pendente"), a recepção resolve depois.
        return;
    }

    try {
        await updateDoc(doc(db, "notificacoes", n.id), {
            status: 'concluida',
            resolvidoPor: clinicaState.sessao.nome,
            resolvidoEm: new Date().toISOString()
        });

        await registrarAuditoria({
            acao: 'Edição',
            modulo: 'Financeiro',
            descricao: `Pagamento confirmado: ${n.pacienteNome || 'paciente'}`
        });

        showToast('Pagamento confirmado com sucesso.', 'success');
    } catch (error) {
        console.error("Erro ao confirmar pagamento: ", error);
        showToast('Falha ao confirmar pagamento. Tente novamente pela lista de Notificações.', 'error');
    }
}

export function initNotificacoes() {
    const lista = document.getElementById('notificacoes-lista');
    if (lista) {
        lista.addEventListener('click', async (e) => {
            const btnResolver = e.target.closest('.btn-resolver-notificacao');
            if (!btnResolver) return;

            const id = btnResolver.getAttribute('data-id');
            btnResolver.disabled = true;

            try {
                await updateDoc(doc(db, "notificacoes", id), {
                    status: 'concluida',
                    resolvidoPor: clinicaState.sessao.nome,
                    resolvidoEm: new Date().toISOString()
                });
                showToast('Pendência marcada como resolvida.', 'success');
            } catch (error) {
                console.error("Erro ao resolver notificação: ", error);
                showToast('Falha ao atualizar pendência.', 'error');
                btnResolver.disabled = false;
            }
        });
    }

    const filtro = document.getElementById('filtro-notificacoes');
    if (filtro) {
        filtro.addEventListener('change', () => atualizarListaNotificacoes(filtro.value));
    }
}

// Usado por outros módulos (ex: pacientes.js) para abrir uma pendência.
// Não precisa recarregar nada na tela: quem está com a aba de Notificações
// aberta em QUALQUER sessão recebe isso na hora via escutarNotificacoes().
export async function criarNotificacao({ tipo = 'geral', titulo, mensagem, pacienteId = null, pacienteNome = null }) {
    try {
        await addDoc(collection(db, "notificacoes"), {
            tipo,
            titulo,
            mensagem,
            pacienteId,
            pacienteNome,
            status: 'pendente',
            criadoPor: clinicaState.sessao.nome,
            criadoEm: new Date().toISOString(),
            clinicaId: clinicaState.sessao.clinicaId
        });
    } catch (error) {
        console.error("Erro ao criar notificação: ", error);
    }
}

// Escuta em tempo real (Firestore onSnapshot): assim que alguém cria uma
// pendência, qualquer outra sessão logada na mesma clínica vê na hora,
// sem precisar dar F5. É isso que faz o aviso "chegar" pra recepção
// no exato momento em que o médico grava o retorno.
let pararDeEscutar = null;
let primeiraCarga = true;

export function escutarNotificacoes() {
    const q = query(
        collection(db, "notificacoes"),
        where("clinicaId", "==", clinicaState.sessao.clinicaId)
    );

    pararDeEscutar = onSnapshot(q, (snapshot) => {
        clinicaState.notificacoes = [];
        snapshot.forEach((d) => {
            clinicaState.notificacoes.push({ ...d.data(), id: String(d.id) });
        });

        // Toast em tempo real só pra pendências novas chegando depois do
        // login (a primeira carga não deve gerar uma enxurrada de toasts)
        if (!primeiraCarga) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && change.doc.data().status === 'pendente') {
                    const n = { ...change.doc.data(), id: String(change.doc.id) };

                    // Pendência de pagamento: quem está na recepção recebe o
                    // popup de confirmação na hora, em vez de só o toast.
                    if (n.tipo === 'pagamento_pendente' && clinicaState.sessao.perfil === 'recepcao') {
                        tratarNotificacaoPagamento(n);
                    } else {
                        showToast(`Nova pendência: ${n.titulo}`, 'warning');
                    }
                }
            });
        }
        primeiraCarga = false;

        atualizarBadgeNotificacoes();
        atualizarListaNotificacoes(document.getElementById('filtro-notificacoes')?.value || 'pendentes');
    }, (error) => {
        console.error("Erro ao escutar notificações: ", error);
    });
}

export function pararEscutaNotificacoes() {
    if (pararDeEscutar) pararDeEscutar();
}

function atualizarBadgeNotificacoes() {
    const badge = document.getElementById('badge-notificacoes');
    if (!badge) return;

    const pendentes = clinicaState.notificacoes.filter(n => n.status === 'pendente').length;
    badge.textContent = pendentes;
    badge.style.display = pendentes > 0 ? 'inline-flex' : 'none';
}

export function atualizarListaNotificacoes(filtro = 'pendentes') {
    const lista = document.getElementById('notificacoes-lista');
    if (!lista) return;

    let itens = clinicaState.notificacoes.slice();
    if (filtro === 'pendentes') itens = itens.filter(n => n.status === 'pendente');
    else if (filtro === 'concluidas') itens = itens.filter(n => n.status === 'concluida');

    itens.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));

    if (itens.length === 0) {
        lista.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 30px;">Nenhuma pendência por aqui. Tudo em dia! ✅</p>';
        return;
    }

    lista.innerHTML = itens.map(n => {
        const icone = ICONES_TIPO[n.tipo] || ICONES_TIPO.geral;
        const dataFormatada = n.criadoEm ? new Date(n.criadoEm).toLocaleString('pt-BR') : '';
        const concluida = n.status === 'concluida';

        return `
        <div class="dash-list-item ${concluida ? '' : 'warning'}" style="align-items: flex-start;">
            <div>
                <strong><i class="fa-solid ${icone}"></i> ${escapeHTML(n.titulo)}</strong><br>
                <span style="color: var(--text-light); font-size: 0.85rem;">${escapeHTML(n.mensagem)}</span><br>
                <span style="color: var(--text-light); font-size: 0.7rem;">Criado por ${escapeHTML(n.criadoPor || 'Sistema')} em ${dataFormatada}</span>
            </div>
            ${concluida
                ? '<span class="badge success">Resolvido</span>'
                : `<button class="btn-action btn-resolver-notificacao" data-id="${n.id}" title="Marcar como resolvido"><i class="fa-solid fa-check"></i> Resolver</button>`
            }
        </div>`;
    }).join('');
}