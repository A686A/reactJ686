import Modal from "../../../shared/components/Modal";
import { formatNumber } from "../model/propertyFormModel";
/**
 * 展示房源详情，将面积、金额和日期转换为可读格式。
 * @param {object} props 包含只读房源 property 与关闭回调 onClose。
 */
export default function PropertyDetailsDialog({ property, onClose }) {
  const fields = {
    房源编号: property.code,
    城市区域: `${property.city} · ${property.district}`,
    详细地址: property.address,
    房源类型: property.type,
    房源状态: property.status,
    建筑面积: `${formatNumber(property.area)} ㎡`,
    总价: `${formatNumber(property.price)} 万元`,
    房间数: property.rooms,
    联系人: property.contact,
    联系电话: property.phone,
    创建时间: new Date(property.createdAt).toLocaleString("zh-CN"),
    更新时间: new Date(property.updatedAt).toLocaleString("zh-CN"),
    备注: property.description || "—",
  };
  return (
    <Modal title={property.name} onClose={onClose} wide>
      <dl className="detail-grid">
        {Object.entries(fields).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="modal-actions">
        <button className="button primary" onClick={onClose}>
          关闭详情
        </button>
      </div>
    </Modal>
  );
}
