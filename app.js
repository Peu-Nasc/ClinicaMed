document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. BANCO DE DADOS EM MEMÓRIA (ESTADO ERP)
    // ==========================================
    const clinicaState = {
        pacientes: [],
        profissionais: [],
        estoque: [],
        financeiro: { lancamentos: [] },
        agenda: { agendamentos: [] }
    };

    const appointmentTimes = ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00'];
    const formatCurrency = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    // ==========================================
    // 2. NAVEGAÇÃO SPA E UTILITÁRIOS
    // ==========================================
    document.querySelectorAll('.menu-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
            
            const target = e.currentTarget.getAttribute('data-target');
            document.getElementById(target).classList.add('active');
            e.currentTarget.classList.add('active');
            
            if (target === 'estoque') verificarAlertasEstoque();
            if (target === 'dashboard') calcularDRE();
            if (target === 'agenda') atualizarAgenda();
        });
    });

    // Fechar qualquer modal ao clicar fora ou apertar ESC
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.remove('active');
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
        }
    });

    // ==========================================
    // 3. MÓDULO DE CADASTRO E VERIFICAÇÃO DE CPF (PK)
    // ==========================================
    const modalCadastro = document.getElementById('modal-cadastro');
    const tipoCadastro = document.getElementById('tipo-cadastro');
    
    document.getElementById('btn-novo-paciente').addEventListener('click', () => abrirModalCadastro('paciente'));
    document.getElementById('btn-novo-profissional').addEventListener('click', () => abrirModalCadastro('profissional'));
    document.getElementById('btn-close-cadastro').addEventListener('click', () => modalCadastro.classList.remove('active'));

    function abrirModalCadastro(tipo) {
        document.getElementById('form-cadastro').reset();
        tipoCadastro.value = tipo;
        
        const isPac = tipo === 'paciente';
        document.querySelectorAll('.paciente-only').forEach(el => el.style.display = isPac ? 'grid' : 'none');
        document.querySelectorAll('.profissional-only').forEach(el => el.style.display = !isPac ? 'grid' : 'none');
        
        if(isPac) {
            document.getElementById('step-verificacao-cpf').style.display = 'block';
            document.getElementById('step-dados-cadastrais').style.display = 'none';
        } else {
            document.getElementById('step-verificacao-cpf').style.display = 'none';
            document.getElementById('cad-cpf').removeAttribute('readonly');
            document.getElementById('cad-cpf').style.backgroundColor = '#fbfbfc';
            document.getElementById('step-dados-cadastrais').style.display = 'grid';
        }
        modalCadastro.classList.add('active');
    }

    tipoCadastro.addEventListener('change', (e) => abrirModalCadastro(e.target.value));

    document.getElementById('btn-verificar-cpf').addEventListener('click', () => {
        const cpfDigitado = document.getElementById('cad-cpf-check').value.trim();
        if(!cpfDigitado) return showToast('Por favor, digite o CPF para verificação.', 'warning');

        const pacienteExistente = clinicaState.pacientes.find(p => p.cpf === cpfDigitado);
        if(pacienteExistente) {
            showToast(`Paciente já cadastrado: ${pacienteExistente.nome}. Abrindo prontuário...`, 'warning');
            modalCadastro.classList.remove('active');
            abrirProntuario(pacienteExistente.id);
        } else {
            document.getElementById('cad-cpf').value = cpfDigitado;
            document.getElementById('step-verificacao-cpf').style.display = 'none';
            document.getElementById('step-dados-cadastrais').style.display = 'grid';
            showToast('CPF liberado para novo cadastro.', 'success');
        }
    });

    document.getElementById('form-cadastro').addEventListener('submit', (e) => {
        e.preventDefault();
        const tipo = tipoCadastro.value;
        const baseData = {
            id: Date.now(),
            nome: document.getElementById('cad-nome').value,
            cpf: document.getElementById('cad-cpf').value,
            rg: document.getElementById('cad-rg').value,
            nascimento: document.getElementById('cad-nascimento').value,
            mae: document.getElementById('cad-mae').value,
            telefone: document.getElementById('cad-tel').value,
            email: document.getElementById('cad-email').value,
        };

        if (tipo === 'paciente') {
            clinicaState.pacientes.push({
                ...baseData,
                sangue: document.getElementById('cad-sangue').value,
                alergias: document.getElementById('cad-alergias').value,
                convenio: document.getElementById('cad-convenio').value || 'Particular',
                carteirinha: document.getElementById('cad-carteirinha').value,
                emergencia: document.getElementById('cad-emergencia').value,
                responsavel: document.getElementById('cad-responsavel').value,
                evolucoes: []
            });
            showToast('Paciente cadastrado com sucesso!');
        } else {
            clinicaState.profissionais.push({
                ...baseData,
                conselho: document.getElementById('cad-conselho').value,
                registro: document.getElementById('cad-num-registro').value,
                especialidade: document.getElementById('cad-especialidade').value,
                rqe: document.getElementById('cad-rqe').value,
                vinculo: document.getElementById('cad-vinculo').value
            });
            showToast('Profissional cadastrado com sucesso!');
        }
        modalCadastro.classList.remove('active');
        atualizarTabelas();
        atualizarAgenda();
    });

    // ==========================================
    // 4. PRONTUÁRIO ELETRÔNICO (PEP)
    // ==========================================
    let pacienteAtivoId = null;

    function abrirProntuario(idPaciente) {
        const paciente = clinicaState.pacientes.find(p => p.id === idPaciente);
        if (paciente) {
            document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('pacientes').classList.add('active');
            document.querySelector('[data-target="pacientes"]').classList.add('active');

            pacienteAtivoId = paciente.id;
            document.getElementById('pep-nome-paciente').textContent = paciente.nome;
            document.getElementById('pep-cpf').textContent = `CPF: ${paciente.cpf} | Nasc: ${paciente.nascimento}`;
            document.getElementById('pep-convenio').textContent = `Convênio: ${paciente.convenio}`;
            document.getElementById('pep-sangue').textContent = `Sangue: ${paciente.sangue || 'Não inf.'}`;
            document.getElementById('pep-alergias').textContent = `Alergias: ${paciente.alergias || 'Nenhuma'}`;
            
            renderizarEvolucoes(paciente);
            renderizarResumoPacienteAtivo();
            document.getElementById('prontuario-ativo').style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    document.getElementById('btn-buscar-paciente').addEventListener('click', () => {
        const query = document.getElementById('search-paciente').value.toLowerCase();
        const paciente = clinicaState.pacientes.find(p => p.nome.toLowerCase().includes(query) || p.cpf === query);
        if (paciente) {
            abrirProntuario(paciente.id);
            showToast('Prontuário encontrado.', 'success');
        } else {
            showToast('Paciente não localizado.', 'error');
        }
    });

    document.getElementById('btn-fechar-pep').addEventListener('click', () => {
        document.getElementById('prontuario-ativo').style.display = 'none';
        pacienteAtivoId = null;
        renderizarResumoPacienteAtivo();
    });

    document.getElementById('form-evolucao').addEventListener('submit', (e) => {
        e.preventDefault();
        if(!pacienteAtivoId) return;

        const paciente = clinicaState.pacientes.find(p => p.id === pacienteAtivoId);
        const texto = `
**Anamnese:** ${document.getElementById('pep-anamnese').value}
**Exame Físico:** ${document.getElementById('pep-exame-fisico').value}
**Diagnóstico:** ${document.getElementById('pep-diagnostico').value || 'N/A'}
**Prescrição:** ${document.getElementById('pep-prescricao').value}
        `.trim();

        paciente.evolucoes.push({
            data: new Date().toLocaleString('pt-BR'),
            texto: texto,
            assinatura: 'Assinado por Dr. Administrador (ICP-Brasil)'
        });

        renderizarEvolucoes(paciente);
        e.target.reset();
        showToast('Evolução salva no PEP.');
    });

    function renderizarEvolucoes(paciente) {
        const container = document.getElementById('pep-timeline');
        container.innerHTML = paciente.evolucoes.slice().reverse().map(evo => `
            <div class="timeline-item">
                <div class="timeline-meta">
                    <span><i class="fa-regular fa-calendar"></i> ${evo.data}</span>
                    <span style="color:#198754"><i class="fa-solid fa-lock"></i> ${evo.assinatura}</span>
                </div>
                <div class="timeline-content">${evo.texto.replace(/\n/g, '<br>')}</div>
            </div>
        `).join('') || '<p>Sem registros anteriores.</p>';
    }

    const patientListBody = document.getElementById('patient-table-body-list');
    if (patientListBody) {
        patientListBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-abrir-prontuario');
            if (btn) abrirProntuario(Number(btn.getAttribute('data-id')));
        });
    }

    // ==========================================
    // 5. AGENDA MULTIPROFISSIONAL
    // ==========================================
    const modalAgenda = document.getElementById('modal-agendamento');
    const inputDataAgenda = document.getElementById('data-agenda');
    const filtroProfissional = document.getElementById('filtro-profissional');

    inputDataAgenda.value = new Date().toISOString().split('T')[0];

    document.getElementById('btn-novo-agendamento').addEventListener('click', () => abrirModalAgendamento());
    document.getElementById('btn-close-agendamento').addEventListener('click', () => modalAgenda.classList.remove('active'));
    
    inputDataAgenda.addEventListener('change', atualizarAgenda);
    filtroProfissional.addEventListener('change', atualizarAgenda);

    function abrirModalAgendamento(hora = '', profId = '', data = '') {
        const selPac = document.getElementById('agenda-paciente');
        const selProf = document.getElementById('agenda-profissional');
        
        selPac.innerHTML = clinicaState.pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        selProf.innerHTML = clinicaState.profissionais.map(p => `<option value="${p.id}">${p.nome} (${p.especialidade})</option>`).join('');
        
        if(data) document.getElementById('agenda-data').value = data;
        else document.getElementById('agenda-data').value = inputDataAgenda.value;
        
        if(hora) document.getElementById('agenda-hora').value = hora;
        if(profId) selProf.value = profId;

        modalAgenda.classList.add('active');
    }

    document.getElementById('form-agendamento').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const pacId = document.getElementById('agenda-paciente').value;
        const profId = document.getElementById('agenda-profissional').value;
        const paciente = clinicaState.pacientes.find(p => p.id == pacId);
        
        clinicaState.agenda.agendamentos.push({
            id: Date.now(),
            pacId: pacId,
            pacNome: paciente ? paciente.nome : 'Paciente',
            profId: profId,
            data: document.getElementById('agenda-data').value,
            hora: document.getElementById('agenda-hora').value
        });

        modalAgenda.classList.remove('active');
        atualizarAgenda();
        showToast('Consulta agendada com sucesso!');
    });

    function atualizarAgenda() {
        const container = document.getElementById('agenda-professionals');
        if (!container) return;

        const dataSelecionada = inputDataAgenda.value;
        const filtro = filtroProfissional.value;
        
        filtroProfissional.innerHTML = `<option value="todos">Todos os Profissionais</option>` + 
            clinicaState.profissionais.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        filtroProfissional.value = filtro; 

        container.innerHTML = '';
        
        const profsParaExibir = filtro === 'todos' 
            ? clinicaState.profissionais 
            : clinicaState.profissionais.filter(p => p.id == filtro);

        if (profsParaExibir.length === 0) {
            container.innerHTML = `
                <div class="professional-column empty-column">
                    <div class="prof-header">
                        <strong>Sem Profissionais</strong>
                        <small>Cadastre um médico para gerar a agenda</small>
                    </div>
                </div>`;
            return;
        }

        profsParaExibir.forEach(prof => {
            const coluna = document.createElement('div');
            coluna.className = 'professional-column';
            coluna.innerHTML = `<div class="prof-header"><strong>${prof.nome}</strong><small>${prof.especialidade}</small></div>`;

            appointmentTimes.forEach(hora => {
                const agendamento = clinicaState.agenda.agendamentos.find(a => 
                    a.profId == prof.id && a.data === dataSelecionada && a.hora === hora
                );

                const slot = document.createElement('div');
                if (agendamento) {
                    slot.className = 'appointment-slot occupied';
                    slot.dataset.status = 'confirmado';
                    slot.innerHTML = `<p class="patient-name">${agendamento.pacNome}</p><span class="appointment-type">Consulta</span>`;
                } else {
                    slot.className = 'appointment-slot empty';
                    slot.textContent = 'Livre';
                    slot.addEventListener('click', () => abrirModalAgendamento(hora, prof.id, dataSelecionada));
                }
                coluna.appendChild(slot);
            });
            container.appendChild(coluna);
        });
    }

    // ==========================================
    // 6. ESTOQUE E FINANCEIRO
    // ==========================================
    const modalEstoque = document.getElementById('modal-estoque');
    document.getElementById('btn-abrir-modal-estoque').addEventListener('click', () => modalEstoque.classList.add('active'));
    document.getElementById('btn-close-estoque').addEventListener('click', () => modalEstoque.classList.remove('active'));

    document.getElementById('form-estoque').addEventListener('submit', (e) => {
        e.preventDefault();
        clinicaState.estoque.push({
            id: Date.now(),
            codigo: document.getElementById('est-codigo').value,
            nome: document.getElementById('est-nome').value,
            apresentacao: document.getElementById('est-apresentacao').value,
            anvisa: document.getElementById('est-anvisa').value,
            lote: document.getElementById('est-lote').value,
            validade: document.getElementById('est-validade').value,
            qtd: parseInt(document.getElementById('est-qtd').value),
            min: parseInt(document.getElementById('est-min').value),
            controle: document.getElementById('est-controle').value
        });
        modalEstoque.classList.remove('active');
        e.target.reset();
        atualizarTabelas();
        showToast('Item registrado no estoque.');
    });

    function verificarAlertasEstoque() {
        const hoje = new Date();
        clinicaState.estoque.forEach(item => {
            if (item.qtd <= item.min) showToast(`⚠️ Alerta: ${item.nome} atingiu o estoque mínimo!`, 'warning');
            const diasVenc = Math.floor((new Date(item.validade) - hoje) / (1000 * 60 * 60 * 24));
            if (diasVenc <= 30 && diasVenc >= 0) showToast(`🚨 Lote ${item.lote} de ${item.nome} vence em ${diasVenc} dias!`, 'error');
            else if (diasVenc < 0) showToast(`🚫 Item Vencido: Lote ${item.lote} de ${item.nome}!`, 'error');
        });
    }

    const modalFinanceiro = document.getElementById('modal-financeiro');
    document.getElementById('btn-abrir-modal-financeiro').addEventListener('click', () => {
        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('fin-competencia').value = hoje;
        document.getElementById('fin-caixa').value = hoje;
        modalFinanceiro.classList.add('active');
    });
    document.getElementById('btn-close-financeiro').addEventListener('click', () => modalFinanceiro.classList.remove('active'));

    document.getElementById('form-financeiro').addEventListener('submit', (e) => {
        e.preventDefault();
        clinicaState.financeiro.lancamentos.push({
            id: Date.now(),
            tipo: document.getElementById('fin-tipo').value,
            vinculo: document.getElementById('fin-vinculo').value,
            pagamento: document.getElementById('fin-pagamento').value,
            status: document.getElementById('fin-status').value,
            competencia: document.getElementById('fin-competencia').value,
            caixa: document.getElementById('fin-caixa').value,
            valor: parseFloat(document.getElementById('fin-valor').value)
        });
        modalFinanceiro.classList.remove('active');
        e.target.reset();
        atualizarTabelas();
        calcularDRE();
        showToast('Lançamento financeiro salvo.');
    });

    function calcularDRE() {
        let receitas = 0, despesas = 0, glosas = 0;

        clinicaState.financeiro.lancamentos.forEach(l => {
            if (l.status === 'Recebido/Pago') {
                if (l.tipo === 'Receita') receitas += l.valor;
                else despesas += l.valor;
            } else if (l.status === 'Glosa') {
                glosas += l.valor;
            }
        });

        const lucro = receitas - despesas;
        
        const dashRec = document.getElementById('dash-receitas');
        const dashDesp = document.getElementById('dash-despesas');
        const dashGlosas = document.getElementById('dash-glosas');
        const dashLucro = document.getElementById('dash-lucro');

        if(dashRec) dashRec.textContent = formatCurrency(receitas);
        if(dashDesp) dashDesp.textContent = formatCurrency(despesas);
        if(dashGlosas) dashGlosas.textContent = formatCurrency(glosas);
        if(dashLucro) {
            dashLucro.textContent = formatCurrency(lucro);
            dashLucro.style.color = lucro < 0 ? '#dc3545' : 'var(--primary-color)';
        }
    }

    // ==========================================
    // 7. ATUALIZAÇÃO GLOBAL DE TABELAS
    // ==========================================
    function renderizarResumoPacienteAtivo() {
        const container = document.getElementById('patient-table-body-prontuario');
        if (!container) return;
        if (!pacienteAtivoId) {
            container.innerHTML = '';
            return;
        }
        const paciente = clinicaState.pacientes.find(p => p.id === pacienteAtivoId);
        if (!paciente) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `
            <tr>
                <td><strong>${paciente.nome}</strong></td>
                <td>${paciente.cpf}</td>
                <td>${paciente.convenio}</td>
                <td style="color:red">${paciente.alergias || '-'}</td>
                <td>
                    <button class="btn-action btn-abrir-prontuario" data-id="${paciente.id}">
                        <i class="fa-regular fa-folder-open"></i> Abrir em PEP
                    </button>
                </td>
            </tr>`;
    }

    function atualizarTabelas() {
        const patientListBody = document.getElementById('patient-table-body-list');
        if (patientListBody) {
            patientListBody.innerHTML = clinicaState.pacientes.map(p => 
                `<tr>
                    <td><strong>${p.nome}</strong></td>
                    <td>${p.cpf}</td>
                    <td>${p.convenio}</td>
                    <td style="color:red">${p.alergias || '-'}</td>
                    <td>
                        <button class="btn-action btn-abrir-prontuario" data-id="${p.id}">
                            <i class="fa-regular fa-folder-open"></i> Acessar Ficha
                        </button>
                    </td>
                </tr>`
            ).join('');
        }

        renderizarResumoPacienteAtivo();

        document.getElementById('stock-table-body').innerHTML = clinicaState.estoque.map(i => {
            const isVencido = new Date(i.validade) < new Date();
            const badgeClass = i.qtd <= i.min || isVencido ? 'warning' : 'success';
            return `<tr>
                <td>${i.codigo}</td>
                <td><strong>${i.nome}</strong><br><small>${i.apresentacao} | ${i.controle}</small></td>
                <td>L: ${i.lote}<br><small>Val: ${i.validade}</small></td>
                <td><span class="badge ${badgeClass}">${i.qtd} un</span></td>
                <td><button class="btn-action">Baixar Cód.Barras</button></td>
            </tr>`;
        }).join('');

        document.getElementById('finance-table-body').innerHTML = clinicaState.financeiro.lancamentos.slice().reverse().map(l => {
            const isEntrada = l.tipo === 'Receita';
            return `<tr>
                <td>${l.competencia}</td>
                <td>${l.caixa}</td>
                <td><strong>${l.tipo}</strong></td>
                <td>${l.vinculo}</td>
                <td>${l.pagamento}</td>
                <td><span class="badge ${l.status === 'Recebido/Pago' ? 'success' : 'warning'}">${l.status}</span></td>
                <td class="${isEntrada ? 'positivo' : 'negativo'}">${isEntrada ? '+' : '-'} ${formatCurrency(l.valor)}</td>
            </tr>`;
        }).join('');
    }

    // Inicialização ao carregar a página
    calcularDRE();
    atualizarTabelas();
    atualizarAgenda();
});