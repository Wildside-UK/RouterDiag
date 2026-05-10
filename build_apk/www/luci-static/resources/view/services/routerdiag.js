'use strict';
'require view';
'require fs';
'require ui';
'require dom';
'require poll';

var CSS = '\
.rd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1em; margin-bottom: 1em; } \
.rd-grid > div { min-width: 0; } \
@media (max-width: 900px) { .rd-grid { grid-template-columns: 1fr; } } \
.rd-card { background: var(--background-color-high, #fff); border: 1px solid var(--border-color-medium, #ddd); border-radius: 4px; padding: 1em; margin-bottom: 1em; } \
.rd-card h3 { margin: 0 0 0.8em 0; padding-bottom: 0.4em; border-bottom: 1px solid var(--border-color-medium, #eee); } \
.rd-kv { display: grid; grid-template-columns: 10em 1fr; gap: 0.3em 1em; } \
.rd-kv .k { font-weight: bold; color: var(--color-text-secondary, #666); } \
.rd-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: bold; font-size: 0.9em; } \
.rd-ok { background: #d4edda; color: #155724; } \
.rd-degraded { background: #fff3cd; color: #856404; } \
.rd-failed { background: #f8d7da; color: #721c24; } \
.rd-unknown { background: #e2e3e5; color: #383d41; } \
.rd-pre { white-space: pre-wrap; word-break: break-word; font-family: monospace; font-size: 0.85em; background: var(--background-color-low, #f8f9fa); padding: 0.8em; border-radius: 4px; max-height: 25em; overflow-y: auto; } \
.rd-actions { display: flex; gap: 0.5em; flex-wrap: wrap; margin-bottom: 1em; } \
.rd-fix-table { width: 100%; border-collapse: collapse; } \
.rd-fix-table th, .rd-fix-table td { text-align: left; padding: 0.3em 0.6em; border-bottom: 1px solid var(--border-color-medium, #eee); } \
.rd-config-row { display: grid; grid-template-columns: 12em 1fr; gap: 0.5em; align-items: center; margin-bottom: 0.5em; } \
.rd-config-row label { font-weight: bold; } \
.rd-config-row input, .rd-config-row select { padding: 4px 8px; border: 1px solid var(--border-color-medium, #ccc); border-radius: 3px; } \
.rd-sensor-table { width: 100%; border-collapse: collapse; margin-top: 1em; } \
.rd-sensor-table th, .rd-sensor-table td { padding: 0.5em; border-bottom: 1px solid var(--border-color-medium, #eee); text-align: left; } \
.rd-sensor-table input[type="text"], .rd-sensor-table input[type="number"] { width: 100%; box-sizing: border-box; } \
.rd-chart-container { height: 250px; margin-top: 1em; } \
';

function badge(status) {
	var cls = 'rd-badge ';
	var s = (status || 'unknown').toUpperCase();
	if (s === 'OK') cls += 'rd-ok';
	else if (s === 'DEGRADED') cls += 'rd-degraded';
	else if (s === 'FAILED' || s === 'CRITICAL') cls += 'rd-failed';
	else cls += 'rd-unknown';
	return E('span', { 'class': cls }, s);
}

function kv(label, value) {
	return [
		E('span', { 'class': 'k' }, label),
		E('span', {}, value || '-')
	];
}

function kvNode(label, node) {
	return [
		E('span', { 'class': 'k' }, label),
		E('span', {}, [ node ])
	];
}

function fetchData() {
	return fs.exec('/usr/bin/router-diag', ['luci-json']).then(function(res) {
		if (res && res.code === 0 && res.stdout) {
			try {
				return JSON.parse(res.stdout.trim());
			} catch(e) {
				return null;
			}
		}
		return null;
	}).catch(function() {
		return null;
	});
}

return view.extend({
	load: function() {
		// Load Chart.js dynamically
		var script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
		document.head.appendChild(script);

		return fetchData();
	},

	renderOverview: function(data) {
		var card = E('div', { 'class': 'rd-card' });
		card.appendChild(E('h3', {}, _('Overview')));
		var grid = E('div', { 'class': 'rd-kv' });

		kv(_('Version'), 'v' + (data.version || '?')).forEach(function(n) { grid.appendChild(n); });

		var daemonText = data.daemon.running ? 'Running (PID ' + data.daemon.pid + ')' : 'Stopped';
		kvNode(_('Daemon'), E('span', { 'style': data.daemon.running ? 'color:green' : 'color:red' }, daemonText))
			.forEach(function(n) { grid.appendChild(n); });

		if (data.usb.mounted) {
			kv(_('USB Storage'), data.usb.used + ' / ' + data.usb.size + ' (' + data.usb.available + ' free)')
				.forEach(function(n) { grid.appendChild(n); });
		} else {
			kvNode(_('USB Storage'), E('span', { 'style': 'color:red' }, _('Not mounted')))
				.forEach(function(n) { grid.appendChild(n); });
		}

		kv(_('API Key'), data.api_key_set ? _('Configured') : _('Not set'))
			.forEach(function(n) { grid.appendChild(n); });
		kv(_('Metrics'), data.metrics_count + ' records')
			.forEach(function(n) { grid.appendChild(n); });

		card.appendChild(grid);
		return card;
	},

	renderSignal: function(data) {
		var m = data.last_metrics;
		var card = E('div', { 'class': 'rd-card' });
		card.appendChild(E('h3', {}, _('Signal & System')));

		if (!m || !m.timestamp) {
			card.appendChild(E('p', { 'style': 'color:var(--color-text-secondary,#999)' }, _('No metrics collected yet.')));
			return card;
		}

		var grid = E('div', { 'class': 'rd-kv' });

		kv(_('Live Reading'), m.timestamp).forEach(function(n) { grid.appendChild(n); });
		kv(_('RSRP'), m.rsrp ? m.rsrp + ' dBm' : '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('RSRQ'), m.rsrq ? m.rsrq + ' dB' : '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('SNR'), m.snr ? m.snr + ' dB' : '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('Bands'), m.bands || '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('Weather'), m.weather ? m.weather.replace(/\|/g, ', ') : '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('Latency'), m.latency_ms ? m.latency_ms + ' ms' : '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('Load (1m)'), m.load_1m || '-').forEach(function(n) { grid.appendChild(n); });
		kv(_('Free Memory'), m.mem_free_kb ? m.mem_free_kb + ' KB' : '-').forEach(function(n) { grid.appendChild(n); });

		// Dynamic Sensors
		if (m.sensors && m.sensors.length > 0) {
			var sensorConfigs = (data.config.sensors || "").split(" ");
			var activeLabels = [];
			sensorConfigs.forEach(function(s) {
				var parts = s.split("|");
				if (parts.length >= 5 && parts[4] === "1") {
					activeLabels.push(parts[1]);
				}
			});

			m.sensors.forEach(function(val, idx) {
				var label = activeLabels[idx] || _('Sensor ') + (idx + 1);
				kv(label, val + '°C').forEach(function(n) { grid.appendChild(n); });
			});
		}

		card.appendChild(grid);
		return card;
	},

	renderTrends: function(data) {
		var card = E('div', { 'class': 'rd-card', 'style': 'grid-column: span 2' });
		card.appendChild(E('h3', {}, _('Historical Trends')));

		if (!data.history || data.history.length === 0) {
			card.appendChild(E('p', { 'style': 'color:var(--color-text-secondary,#999)' }, _('Insufficient data for charts.')));
			return card;
		}

		var chartGrid = E('div', { 'class': 'rd-grid' });
		
		var signalContainer = E('div', { 'class': 'rd-chart-container' });
		var signalCanvas = E('canvas', { 'id': 'signalChart' });
		signalContainer.appendChild(signalCanvas);
		chartGrid.appendChild(signalContainer);

		var systemContainer = E('div', { 'class': 'rd-chart-container' });
		var systemCanvas = E('canvas', { 'id': 'systemChart' });
		systemContainer.appendChild(systemCanvas);
		chartGrid.appendChild(systemContainer);

		card.appendChild(chartGrid);

		// Wait for Chart.js and DOM
		window.setTimeout(function() {
			if (typeof Chart === 'undefined') return;

			var labels = data.history.map(function(d) { return d[0].split(' ')[1]; }); // HH:MM:SS
			
			// Signal Chart
			new Chart(signalCanvas, {
				type: 'line',
				data: {
					labels: labels,
					datasets: [
						{
							label: 'RSRP (dBm)',
							data: data.history.map(function(d) { return d[1]; }),
							borderColor: '#28a745',
							yAxisID: 'y'
						},
						{
							label: 'SNR (dB)',
							data: data.history.map(function(d) { return d[4]; }),
							borderColor: '#007bff',
							yAxisID: 'y1'
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'RSRP' } },
						y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'SNR' }, grid: { drawOnChartArea: false } }
					}
				}
			});

			// System Chart
			new Chart(systemCanvas, {
				type: 'line',
				data: {
					labels: labels,
					datasets: [
						{
							label: 'Temp (°C)',
							data: data.history.map(function(d) { return d[10]; }),
							borderColor: '#dc3545'
						},
						{
							label: 'Load',
							data: data.history.map(function(d) { return d[8]; }),
							borderColor: '#ffc107'
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false
				}
			});
		}, 1000);

		return card;
	},

	renderHealth: function(data) {
		var card = E('div', { 'class': 'rd-card' });
		card.appendChild(E('h3', {}, _('Network Health')));

		var h = data.health;
		var grid = E('div', { 'class': 'rd-kv' });

		kvNode(_('Status'), badge(h.status)).forEach(function(n) { grid.appendChild(n); });

		if (h.seconds_ago !== null && h.seconds_ago !== undefined) {
			var mins = Math.floor(h.seconds_ago / 60);
			kv(_('Last Check'), mins + 'm ago').forEach(function(n) { grid.appendChild(n); });
		}

		if (h.failed) {
			kv(_('Failed Services'), h.failed).forEach(function(n) { grid.appendChild(n); });
		}

		card.appendChild(grid);

		// Fix attempts table
		if (data.fixes && data.fixes.length > 0) {
			card.appendChild(E('h4', { 'style': 'margin: 0.8em 0 0.4em 0' }, _('Recent Fix Attempts')));
			var table = E('table', { 'class': 'rd-fix-table' });
			table.appendChild(E('thead', {}, [
				E('tr', {}, [
					E('th', {}, _('Service')),
					E('th', {}, _('Attempts')),
					E('th', {}, _('Time Ago'))
				])
			]));
			var tbody = E('tbody', {});
			data.fixes.forEach(function(f) {
				tbody.appendChild(E('tr', {}, [
					E('td', {}, f.service),
					E('td', {}, String(f.count)),
					E('td', {}, f.mins_ago + 'm')
				]));
			});
			table.appendChild(tbody);
			card.appendChild(table);
		}

		return card;
	},

	renderAnalysis: function(data) {
		var card = E('div', { 'class': 'rd-card' });
		card.appendChild(E('h3', {}, _('Last Analysis')));

		if (data.last_analysis) {
			card.appendChild(E('div', { 'class': 'rd-pre' }, data.last_analysis));
		} else {
			card.appendChild(E('p', { 'style': 'color:var(--color-text-secondary,#999)' }, _('No analysis results yet.')));
		}

		return card;
	},

	renderConfig: function(data) {
		var card = E('div', { 'class': 'rd-card' });
		card.appendChild(E('h3', {}, _('Identity & Environment')));

		var cfg = data.config || {};
		var identFields = [
			{ key: 'model_name',   configKey: 'model_name',   label: _('Router Model'),          type: 'text' },
			{ key: 'site_type',    configKey: 'site_type',    label: _('Site Environment'),      type: 'text' },
			{ key: 'rsrp_base',    configKey: 'rsrp_base',    label: _('Baseline RSRP (dBm)'),   type: 'number' },
			{ key: 'snr_base',     configKey: 'snr_base',     label: _('Baseline SNR (dB)'),     type: 'number' },
			{ key: 'services',     configKey: 'services',     label: _('Authorized Services'),   type: 'text' },
			{ key: 'modem_iface',  configKey: 'modem_iface',  label: _('Modem Interface (UCI)'), type: 'text' },
			{ key: 'pref_bands',   configKey: 'pref_bands',   label: _('Preferred Bands'),       type: 'text' },
			{ key: 'pref_cell',    configKey: 'pref_cell',    label: _('Preferred Cell (E,P)'),  type: 'text' },
			{ key: 'reboot_timeout', configKey: 'reboot_timeout', label: _('Reboot Timeout (mins)'), type: 'number' }
		];

		var container = E('div', {});
		identFields.forEach(function(f) {
			var row = E('div', { 'class': 'rd-config-row' });
			row.appendChild(E('label', {}, f.label));
			var val = cfg[f.configKey] || '';
			row.appendChild(E('input', { type: 'text', value: val, 'data-key': f.key, 'data-orig': val }));
			container.appendChild(row);
		});

		card.appendChild(container);
		card.appendChild(E('h3', { 'style': 'margin-top: 1.5em' }, _('General Configuration')));

		var fields = [
			{ key: 'latency',         configKey: 'latency_threshold', label: _('Latency Threshold (ms)'),  type: 'number' },
			{ key: 'hourly',          configKey: 'hourly_check',      label: _('Hourly Check'),            type: 'toggle' },
			{ key: 'cooldown',        configKey: 'api_cooldown',      label: _('API Cooldown (seconds)'),  type: 'number' },
			{ key: 'email_enabled',   configKey: 'email_enabled',     label: _('Email Notifications'),     type: 'toggle' },
			{ key: 'email_to',        configKey: 'email_to',          label: _('Email Address'),           type: 'text' },
			{ key: 'interval',        configKey: 'collect_interval',  label: _('Collect Interval (sec)'),  type: 'number' },
			{ key: 'api_key',         configKey: 'gemini_api_key',    label: _('Gemini API Key'),          type: 'text' },
			{ key: 'model',           configKey: 'gemini_model',      label: _('Gemini Model'),            type: 'model' },
			{ key: 'metrics_path',    configKey: 'metrics_path',      label: _('CSV Save Path'),           type: 'text' },
			{ key: 'metrics_max_size', configKey: 'metrics_max_size', label: _('Max CSV Size (MB)'),       type: 'number' },
			{ key: 'weather_api_key', configKey: 'weather_api_key',   label: _('OpenWeather API Key'),     type: 'text' },
			{ key: 'lat',             configKey: 'lat',               label: _('Latitude'),                type: 'text' },
			{ key: 'lon',             configKey: 'lon',               label: _('Longitude'),               type: 'text' },
			{ key: 'self_heal',       configKey: 'self_heal',         label: _('Self-Healing Registry'),   type: 'toggle' },
			{ key: 'flash_safe',      configKey: 'flash_safe',        label: _('Flash-Safe Mode (RAM+AI)'),type: 'toggle' },
			{ key: 'sync_records',    configKey: 'sync_records',      label: _('AI Distillation Every (N)'),type: 'number' }
		];

		var container = E('div', {});
		fields.forEach(function(f) {
			var row = E('div', { 'class': 'rd-config-row' });
			row.appendChild(E('label', {}, f.label));
			var val = cfg[f.configKey] || '';
			var input;
			if (f.type === 'toggle') {
				input = E('select', { 'data-key': f.key, 'data-orig': val }, [
					E('option', { value: '1', selected: val === '1' ? '' : null }, _('Enabled')),
					E('option', { value: '0', selected: val === '0' ? '' : null }, _('Disabled'))
				]);
			} else if (f.type === 'model') {
				input = E('select', { 'data-key': f.key, 'data-orig': val }, [
					E('option', { value: 'gemini-3.1-flash-lite-latest', selected: val === 'gemini-3.1-flash-lite-latest' ? '' : null }, _('Gemini 3.1 Flash-Lite (Default)')),
					E('option', { value: 'gemini-3.1-flash-latest',      selected: val === 'gemini-3.1-flash-latest' ? '' : null },      _('Gemini 3.1 Flash')),
					E('option', { value: 'gemini-3.1-pro-latest',        selected: val === 'gemini-3.1-pro-latest' ? '' : null },        _('Gemini 3.1 Pro')),
					E('option', { value: 'gemini-2.5-flash-latest',      selected: val === 'gemini-2.5-flash-latest' ? '' : null },      _('Gemini 2.5 Flash')),
					E('option', { value: 'gemini-2.5-pro-latest',        selected: val === 'gemini-2.5-pro-latest' ? '' : null },        _('Gemini 2.5 Pro'))
				]);
			} else {
				input = E('input', {
					type: f.type === 'number' ? 'number' : 'text',
					value: val,
					'data-key': f.key,
					'data-orig': val
				});
			}
			row.appendChild(input);
			container.appendChild(row);
		});

		card.appendChild(container);

		// Sensor Configuration
		card.appendChild(E('h3', { 'style': 'margin-top: 1.5em' }, _('Sensor Configuration')));
		card.appendChild(E('p', {}, _('Detected hardware sensors. Enable and set thresholds for AI monitoring.')));

		var sensorTable = E('table', { 'class': 'rd-sensor-table' });
		sensorTable.appendChild(E('thead', {}, [
			E('tr', {}, [
				E('th', {}, _('Enabled')),
				E('th', {}, _('Type/Path')),
				E('th', {}, _('Label')),
				E('th', {}, _('Warning (°C)')),
				E('th', {}, _('Critical (°C)')),
				E('th', {}, _('Current'))
			])
		]));

		var sensorTbody = E('tbody', {});
		var currentSensors = {};
		(cfg.sensors || "").split(" ").forEach(function(s) {
			var p = s.split("|");
			if (p.length >= 5) currentSensors[p[0]] = p;
		});

		(data.sensors_detected || []).forEach(function(sd) {
			var cur = currentSensors[sd.path] || [sd.path, sd.type, 85, 95, 0];
			sensorTbody.appendChild(E('tr', { 'data-path': sd.path }, [
				E('td', {}, E('input', { type: 'checkbox', checked: cur[4] == "1" ? "" : null })),
				E('td', { 'style': 'font-size:0.85em' }, [
					E('strong', {}, sd.type), E('br'), E('span', { 'style': 'color:#888' }, sd.path)
				]),
				E('td', {}, E('input', { type: 'text', value: cur[1], placeholder: _('Label') })),
				E('td', {}, E('input', { type: 'number', value: cur[2] })),
				E('td', {}, E('input', { type: 'number', value: cur[3] })),
				E('td', {}, sd.temp + '°C')
			]));
		});
		sensorTable.appendChild(sensorTbody);
		card.appendChild(sensorTable);

		var saveBtn = E('button', {
			'class': 'cbi-button cbi-button-save',
			'style': 'margin-top: 1.5em',
			'click': function() {
				var promises = [];
				
				// General Config
				var inputs = container.querySelectorAll('[data-key]');
				inputs.forEach(function(el) {
					var cur = el.value;
					if (cur !== el.getAttribute('data-orig')) {
						promises.push(fs.exec('/usr/bin/router-diag', ['config', el.getAttribute('data-key'), cur]));
					}
				});

				// Sensor Config
				var sensorStrings = [];
				sensorTbody.querySelectorAll('tr').forEach(function(tr) {
					var path = tr.getAttribute('data-path');
					var enabled = tr.cells[0].querySelector('input').checked ? "1" : "0";
					var label = tr.cells[2].querySelector('input').value || "Sensor";
					var warn = tr.cells[3].querySelector('input').value || "85";
					var crit = tr.cells[4].querySelector('input').value || "95";
					sensorStrings.push(path + "|" + label + "|" + warn + "|" + crit + "|" + enabled);
				});
				var newSensorsStr = sensorStrings.join(" ");
				if (newSensorsStr !== cfg.sensors) {
					promises.push(fs.exec('/usr/bin/router-diag', ['config', 'sensors', newSensorsStr]));
				}

				if (promises.length === 0) {
					ui.addNotification(null, E('p', _('No changes to save.')), 'info');
					return;
				}

				return Promise.all(promises).then(function() {
					ui.addNotification(null, E('p', _('Configuration saved successfully.')), 'info');
					window.setTimeout(function() { location.reload(); }, 1000);
				}).catch(function(e) {
					ui.addNotification(null, E('p', _('Error saving config: ') + e.message), 'error');
				});
			}
		}, [ _('Save All Settings') ]);

		card.appendChild(saveBtn);
		return card;
	},

	renderActions: function() {
		var self = this;
		var actions = E('div', { 'class': 'rd-actions' });

		var startBtn = E('button', {
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				return fs.exec('/usr/bin/router-diag', ['start']).then(function(res) {
					if (res && res.code === 0) {
						ui.addNotification(null, E('p', _('Daemon started.')), 'info');
						window.setTimeout(function() { self.refreshPage(); }, 1500);
					} else {
						ui.addNotification(null, E('p', _('Failed to start: ') + ((res && res.stderr) || '')), 'error');
					}
				});
			}
		}, [ _('Start Daemon') ]);

		var stopBtn = E('button', {
			'class': 'cbi-button cbi-button-reset',
			'click': function() {
				return fs.exec('/usr/bin/router-diag', ['stop']).then(function(res) {
					if (res && res.code === 0) {
						ui.addNotification(null, E('p', _('Daemon stopped.')), 'info');
						window.setTimeout(function() { self.refreshPage(); }, 1000);
					} else {
						ui.addNotification(null, E('p', _('Failed to stop: ') + ((res && res.stderr) || '')), 'error');
					}
				});
			}
		}, [ _('Stop Daemon') ]);

		var analyzeBtn = E('button', {
			'class': 'cbi-button cbi-button-action',
			'click': function() {
				ui.addNotification(null, E('p', _('Running analysis... this may take a moment.')), 'info');
				return fs.exec('/usr/bin/router-diag', ['analyze']).then(function(res) {
					if (res && res.code === 0) {
						ui.addNotification(null, E('p', _('Analysis complete.')), 'info');
						self.refreshPage();
					} else {
						ui.addNotification(null, E('p', _('Analysis failed: ') + ((res && res.stderr) || '')), 'error');
					}
				});
			}
		}, [ _('Run Analysis Now') ]);

		var refreshBtn = E('button', {
			'class': 'cbi-button',
			'click': function() { self.refreshPage(); }
		}, [ _('Refresh') ]);

		actions.appendChild(startBtn);
		actions.appendChild(stopBtn);
		actions.appendChild(analyzeBtn);
		actions.appendChild(refreshBtn);
		return actions;
	},

	refreshPage: function() {
		var self = this;
		return fetchData().then(function(data) {
			var content = document.getElementById('rd-content');
			if (content && data) {
				dom.content(content, self.renderContent(data));
			} else if (content) {
				dom.content(content, E('p', { 'class': 'alert-message warning' },
					_('Failed to load router-diag data.')));
			}
		});
	},

	renderContent: function(data) {
		var frag = document.createDocumentFragment();
		frag.appendChild(this.renderActions());
		
		var topGrid = E('div', { 'class': 'rd-grid' });
		topGrid.appendChild(this.renderOverview(data));
		topGrid.appendChild(this.renderSignal(data));
		frag.appendChild(topGrid);

		// Trends charts
		frag.appendChild(this.renderTrends(data));

		var bottomGrid = E('div', { 'class': 'rd-grid' });
		bottomGrid.appendChild(this.renderHealth(data));
		bottomGrid.appendChild(this.renderAnalysis(data));
		frag.appendChild(bottomGrid);
		
		frag.appendChild(this.renderConfig(data));
		return frag;
	},

	render: function(data) {
		var style = E('style', {}, CSS);
		var container = E('div', { 'id': 'rd-content' });
		if (data) {
			dom.content(container, this.renderContent(data));
		} else {
			container.appendChild(E('p', { 'class': 'alert-message warning' },
				_('Failed to load router-diag data. Is the script installed and USB mounted?')));
		}
		return E('div', {}, [
			style,
			E('h2', {}, _('RouterDiag Diagnostics')),
			E('div', { 'class': 'cbi-map-descr' },
				_('AI-powered router monitoring, network health, and signal diagnostics.')),
			container
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
