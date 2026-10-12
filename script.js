// --- XỬ LÝ CHUYỂN TAB ---
function switchTab(index) {
    const buttons = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    
    buttons.forEach((btn, idx) => {
        btn.classList.toggle('active', idx === index);
    });
    contents.forEach((content, idx) => {
        content.classList.toggle('active', idx === index);
    });
}

// --- KẾT NỐI MQTT (Mặc định) ---
let client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');
let currentMode = 'SERVER'; 
let bleCharacteristic = null;
let activeTimers = {};          // Lưu trữ setTimeout tắt van
let countdownIntervals = {};    // Lưu trữ bộ đếm hiển thị giao diện theo giây
let remainingSeconds = {};      // Lưu số giây còn lại của từng van

client.on('connect', () => {
    document.getElementById('status').innerText = 'Trạng thái: Kết nối MQTT thành công!';
    document.getElementById('status').style.color = '#2e7d32';
});

client.on('error', (err) => {
    document.getElementById('status').innerText = 'Trạng thái: Lỗi kết nối MQTT!';
    document.getElementById('status').style.color = '#f44336';
});

function updateModeBanner(mode) {
    currentMode = mode;
    const banner = document.getElementById('connection-mode-banner');
    banner.className = "mode-banner"; 
    if (mode === 'BLE') {
        banner.innerText = "⚡ Phương thức hiện tại: Bluetooth (Ưu tiên cao nhất)";
        banner.classList.add('ble-mode');
    } else if (mode === 'WIFI') {
        banner.innerText = "🌐 Phương thức hiện tại: WiFi Nội Bộ";
        banner.classList.add('wifi-mode');
    } else {
        banner.innerText = "☁️ Phương thức hiện tại: Server (MQTT Cloud)";
        banner.classList.add('server-mode');
    }
}

async function sendCommand(payload) {
  const jsonString = JSON.stringify(payload);

    if (currentMode === 'BLE' && bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(jsonString);
            
            // Gửi gói tin kèm phản hồi từ phần cứng
            await bleCharacteristic.writeValueWithResponse(data);
            console.log("Đã gửi qua Bluetooth thành công:", jsonString);
            return;
        } catch (error) {
            alert("Lỗi truyền tin Bluetooth! Hãy thử kết nối lại.");
            console.error(error);
        }
    }
    else if (currentMode === 'WIFI') {
        const espIP = "192.168.1.76"; // IP nội bộ của ESP32
        try {
            await fetch(`http://${espIP}/control?data=${encodeURIComponent(jsonString)}`);
            console.log("Gửi qua WiFi nội bộ:", jsonString);
        } catch (error) {
            alert("Không kết nối được với ESP32 qua WiFi nội bộ!");
            console.error(error);
        }
    } 
    else {
        const topic = 'thong_xyz123_farm/control';
        client.publish(topic, jsonString);
        console.log("Gửi qua Server MQTT:", jsonString);
    }
    // Sự kiện nút bấm gọi gọn gàng
document.getElementById('btn-clear-device').addEventListener('click', () => {
    if (!confirm("Bạn có chắc muốn xóa sạch cấu hình Wi-Fi không?")) return;
    
    sendCommand({
        type: "system",
        action: "clear_wifi"
    });
    
    alert("Đã gửi lệnh xóa cấu hình xuống thiết bị!");
});
}

// --- 3 NÚT KẾT NỐI Ở TAB 3 ---
async function connectWiFi() {
    updateModeBanner('WIFI');
    
    // Địa chỉ IP mặc định của ESP32 khi phát AP riêng hoặc IP nội bộ trong mạng nhà
    const espIP = "192.168.4.1"; // Hoặc đổi thành "192.168.1.76" nếu dùng chung WiFi nhà
    
    try {
        document.getElementById('connection-detail-box').innerText = "Trạng thái: Đang kết nối tới WiFi nội bộ của ESP32...";
        
        // Gửi một request kiểm tra kết nối tới ESP32
        const response = await fetch(`http://${espIP}/control?data=${encodeURIComponent(JSON.stringify({type: 'ping'}))}`);
        
        if (response.ok) {
            document.getElementById('connection-detail-box').innerText = "Trạng thái: Đã kết nối Mạng Nội Bộ (WiFi HTTP) thành công! ✅";
        } else {
            throw new Error("Phản hồi từ ESP32 không hợp lệ");
        }
    } catch (error) {
        console.error(error);
        document.getElementById('connection-detail-box').innerText = "Trạng thái: Không thể kết nối IP nội bộ của ESP32. Hãy kiểm tra lại kết nối Wi-Fi trên điện thoại!";
    }
}

async function connectBluetooth() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Thong_Farm_ESP32' }],
            optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
        });
        
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
        bleCharacteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a9');
        
        // Bắt buộc phải có dòng này để chuyển mode sang BLE
        updateModeBanner('BLE');
        
        document.getElementById('connection-detail-box').innerText = "Trạng thái: Đã kết nối Bluetooth thành công!";
    } catch (error) {
        console.error(error);
        alert("Kết nối Bluetooth thất bại hoặc bị hủy!");
    }
}
function connectServer() {
    updateModeBanner('SERVER');
    document.getElementById('connection-detail-box').innerText = "Trạng thái: Đã chuyển về Server Cloud (MQTT)";
}

// --- TAB 1: 6 VAN THỦ CÔNG & ĐỒNG HỒ ĐẾM NGƯỢC ---
const manualContainer = document.getElementById('manual-valves-container');
for (let i = 1; i <= 6; i++) {
    manualContainer.innerHTML += `
        <div class="valve-card">
            <div class="valve-header">
                <strong>Van Số ${i}</strong>
                <span id="countdown-${i}" style="font-weight: bold; color: #d32f2f; font-size: 14px;"></span>
                <label class="switch">
                    <input type="checkbox" id="valve-toggle-${i}" onchange="handleToggleChange(${i})">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="timer-inputs">
                <span>Hẹn giờ tưới:</span>
                <input type="number" id="h-${i}" value="0" min="0"> giờ 
                <input type="number" id="m-${i}" value="5" min="0" max="59"> phút 
                <input type="number" id="s-${i}" value="0" min="0" max="59"> giây
            </div>
        </div>
    `;
}

function handleToggleChange(valveId) {
    const toggleElem = document.getElementById(`valve-toggle-${valveId}`);
    const countdownElem = document.getElementById(`countdown-${valveId}`);
    const isChecked = toggleElem.checked;
    const action = isChecked ? 'ON' : 'OFF';
    
    let h = parseInt(document.getElementById(`h-${valveId}`).value) || 0;
    let m = parseInt(document.getElementById(`m-${valveId}`).value) || 0;
    let s = parseInt(document.getElementById(`s-${valveId}`).value) || 0;
    
    let totalSeconds = (h * 3600) + (m * 60) + s;

    // Gửi lệnh xuống ESP32
    sendCommand({
        type: 'manual',
        valve: valveId,
        action: action,
        duration_seconds: totalSeconds
    });

    // Xóa bộ đếm cũ nếu đang chạy
    if (activeTimers[valveId]) clearTimeout(activeTimers[valveId]);
    if (countdownIntervals[valveId]) clearInterval(countdownIntervals[valveId]);

    if (isChecked) {
        if (totalSeconds > 0) {
            remainingSeconds[valveId] = totalSeconds;
            
            // Cập nhật giao diện đồng hồ đếm ngược mỗi giây
            countdownIntervals[valveId] = setInterval(() => {
                remainingSeconds[valveId]--;
                
                if (remainingSeconds[valveId] >= 0) {
                    let hrs = Math.floor(remainingSeconds[valveId] / 3600);
                    let mins = Math.floor((remainingSeconds[valveId] % 3600) / 60);
                    let secs = remainingSeconds[valveId] % 60;
                    
                    countdownElem.innerText = `⏱️ Còn lại: ${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                }
            }, 1000);

            // Tự động tắt sau khi hết thời gian
            activeTimers[valveId] = setTimeout(() => {
                toggleElem.checked = false;
                clearInterval(countdownIntervals[valveId]);
                countdownElem.innerText = "Đã xong!";
                
                sendCommand({
                    type: 'manual',
                    valve: valveId,
                    action: 'OFF',
                    duration_seconds: 0
                });
            }, totalSeconds * 1000);
        } else {
            countdownElem.innerText = "Chạy liên tục";
        }
    } else {
        // Nếu thủ công tắt trước khi hết giờ
        countdownElem.innerText = "";
    }
}

// --- TAB 2: LỊCH TRÌNH TỰ ĐỘNG ---
let scheduleCount = 0;
const daysOfWeek = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function addSchedule() {
    if (scheduleCount >= 6) {
        alert("Chỉ được phép thêm tối đa 6 lịch trình!");
        return;
    }
    scheduleCount++;
    const id = scheduleCount; // ID cố định cho luồng này
    const container = document.getElementById('schedules-container');
    
    const scheduleHTML = `
        <div class="schedule-item" id="sch-${id}">
            <h4>Lịch trình #${id} (Luồng độc lập)</h4>
            <div class="form-group">
                <label>Chọn van áp dụng:</label>
                <div class="valve-selector-grid">
                    ${[1,2,3,4,5,6].map(v => `<div class="valve-select-btn" data-val="${v}" onclick="toggleSelect(this)">V${v}</div>`).join('')}
                </div>
            </div>
            <div class="form-group timer-inputs">
                <label>Thời gian tưới:</label>
                <input type="number" class="sch-h" value="0" min="0"> giờ 
                <input type="number" class="sch-m" value="0" min="0" max="59"> phút 
                <input type="number" class="sch-s" value="5" min="0" max="59"> giây
            </div>
            <div class="form-group">
                <label>Thời gian nghỉ giữa các lần (phút):</label>
                <input type="number" class="sch-rest" value="0" min="0">
            </div>
            <div class="form-group">
                <label>Số lần lặp lại:</label>
                <input type="number" class="sch-repeat" value="1" min="1">
            </div>
            <div class="form-group">
                <label>Thời gian bắt đầu trong ngày:</label>
                <input type="time" class="sch-time" value="06:00">
            </div>
            <div class="form-group">
                <label>Tùy chọn lặp lại theo thứ:</label>
                <div class="days-selector-grid">
                    ${daysOfWeek.map(d => `<div class="day-select-btn selected" data-val="${d}" onclick="toggleSelect(this)">${d}</div>`).join('')}
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="btn btn-wifi" style="flex: 2; background-color: #2e7d32;" onclick="saveSingleSchedule(${id})">💾 Lưu Lịch Này</button>
                <button class="btn btn-off" style="flex: 1;" onclick="removeSchedule('sch-${id}', ${id})">Xóa lịch này</button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', scheduleHTML);
}

// Hàm gửi riêng 1 luồng lịch trình khi bấm nút lưu của thẻ đó
function saveSingleSchedule(id) {
    const item = document.getElementById(`sch-${id}`);
    
    let selectedValves = [];
    item.querySelectorAll('.valve-selector-grid .valve-select-btn.selected').forEach(btn => {
        selectedValves.push(parseInt(btn.getAttribute('data-val')));
    });

    let h = parseInt(item.querySelector('.sch-h').value) || 0;
    let m = parseInt(item.querySelector('.sch-m').value) || 0;
    let s = parseInt(item.querySelector('.sch-s').value) || 0;
    let durationSec = (h * 3600) + (m * 60) + s;

    let restMin = parseInt(item.querySelector('.sch-rest').value) || 0;
    let repeatCount = parseInt(item.querySelector('.sch-repeat').value) || 1;
    let startTime = item.querySelector('.sch-time').value;

    let selectedDays = [];
    item.querySelectorAll('.days-selector-grid .day-select-btn.selected').forEach(btn => {
        selectedDays.push(btn.getAttribute('data-val'));
    });

    // Đóng gói gói tin cấu hình cho đúng 1 luồng (ID cụ thể)
    sendCommand({
        type: 'save_single_schedule',
        schedule: {
            id: id,
            valves: selectedValves,
            duration: durationSec,
            rest_minutes: restMin,
            repeats: repeatCount,
            start_time: startTime,
            days: selectedDays
        }
    });

    alert(`Đã lưu và cập nhật riêng cho Lịch trình #${id}!`);
}

function removeSchedule(elementId, id) {
    document.getElementById(elementId).remove();
    // Gửi lệnh xuống ESP32 để xóa luồng này đi
    sendCommand({
        type: 'delete_schedule',
        id: id
    });
}

function toggleSelect(element) {
    element.classList.toggle('selected');
}

function removeSchedule(id) {
    document.getElementById(id).remove();
    scheduleCount--;
}

addSchedule();

function saveAndSendSchedules() {
    const scheduleItems = document.querySelectorAll('.schedule-item');
    let schedulesData = [];

    scheduleItems.forEach((item, index) => {
        let selectedValves = [];
        item.querySelectorAll('.valve-selector-grid .valve-select-btn.selected').forEach(btn => {
            selectedValves.push(parseInt(btn.getAttribute('data-val')));
        });

        let h = parseInt(item.querySelector('.sch-h').value) || 0;
        let m = parseInt(item.querySelector('.sch-m').value) || 0;
        let s = parseInt(item.querySelector('.sch-s').value) || 0;
        let durationSec = (h * 3600) + (m * 60) + s;

        let restMin = parseInt(item.querySelector('.sch-rest').value) || 0;
        let repeatCount = parseInt(item.querySelector('.sch-repeat').value) || 1;
        let startTime = item.querySelector('.sch-time').value;

        let selectedDays = [];
        item.querySelectorAll('.days-selector-grid .day-select-btn.selected').forEach(btn => {
            selectedDays.push(btn.getAttribute('data-val'));
        });

        schedulesData.push({
            id: index + 1,
            valves: selectedValves,
            duration: durationSec,
            rest_minutes: restMin,
            repeats: repeatCount,
            start_time: startTime,
            days: selectedDays
        });
    });

    sendCommand({
        type: 'schedules_config',
        total: schedulesData.length,
        schedules: schedulesData
    });

    alert(`Đã lưu và gửi thành công ${schedulesData.length} lịch trình xuống ESP32!`);
}

// --- BƠM TỔNG KHẨN CẤP ---
function toggleMasterPump() {
    const btn = document.getElementById('btn-master-pump');
    let currentStatus = btn.innerText.includes('Tắt');
    if(currentStatus) {
        btn.innerText = "Bật Lại Bơm Tổng";
        btn.className = "btn btn-on";
        sendCommand({ type: 'system', master_pump: 'OFF' });
    } else {
        btn.innerText = "Tắt Bơm Tổng Khẩn Cấp";
        btn.className = "btn btn-off";
        sendCommand({ type: 'system', master_pump: 'ON' });
    }
}
async function saveWifiViaBLE() {
    const ssid = document.getElementById('wifi-ssid').value;
    const pass = document.getElementById('wifi-pass').value;
    
    if (!ssid || !pass) {
        alert("Vui lòng nhập đầy đủ tên Wi-Fi và mật khẩu!");
        return;
    }

    // Định dạng dữ liệu gửi qua BLE dưới dạng JSON string
    const wifiData = JSON.stringify({
        type: "system",
        action: "save_wifi",
        ssid: ssid,
        pass: pass
    });

    sendCommand({
        type: "system",
        action: "save_wifi",
        ssid: ssid,
        pass: pass
    });
    
    alert("Đã gửi lệnh xóa cấu hình xuống thiết bị!");

}
// Hàm cập nhật tên Wi-Fi hiện tại (có thể gọi khi load trang hoặc chuyển tab)
function updateCurrentWiFiInfo() {
    const wifiDisplay = document.getElementById('current-wifi-display');
    if (currentMode === 'WIFI') {
        wifiDisplay.innerText = "🌐 Đang dùng mạng nội bộ (AP/Local IP)";
    } else if (currentMode === 'BLE') {
        wifiDisplay.innerText = "📶 Đang kết nối qua Bluetooth";
    } else {
        wifiDisplay.innerText = "☁️ Đang kết nối qua Server Cloud (MQTT)";
    }
}
async function fetchCurrentWiFi() {
    const wifiDisplay = document.getElementById('current-wifi-display');
    if (!wifiDisplay) return;

    try {
        // Dùng IP nội bộ của ESP32 hoặc IP đang giao tiếp
        const response = await fetch('http://192.168.4.1/status'); // Hoặc IP mạng nhà của ESP32
        if (response.ok) {
            const data = await response.json();
            wifiDisplay.innerText = `🌐 Đang kết nối mạng: ${data.wifi_ssid} (IP: ${data.ip})`;
        } else {
            wifiDisplay.innerText = "⚠️ Không lấy được thông tin Wi-Fi trực tiếp từ thiết bị";
        }
    } catch (error) {
        wifiDisplay.innerText = "📶 Đang dùng chế độ Cloud / Chưa kết nối trực tiếp IP nội bộ";
    }
}

// Gọi hàm khi vừa mở trang web
window.addEventListener('DOMContentLoaded', () => {
    fetchCurrentWiFi();
});
// Gọi hàm ngay khi tải trang và mỗi khi đổi chế độ kết nối
window.addEventListener('DOMContentLoaded', () => {
    updateCurrentWiFiInfo();
});